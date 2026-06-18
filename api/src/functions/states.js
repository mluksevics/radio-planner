const { app } = require("@azure/functions");
const { BlobServiceClient } = require("@azure/storage-blob");
const { DefaultAzureCredential } = require("@azure/identity");
const crypto = require("crypto");

const ACCOUNT = process.env.STATE_STORAGE_ACCOUNT;
const CONTAINER = "states";
const MAX_BYTES = 4 * 1024 * 1024; // 4 MB cap per snapshot

// Lazily create a container client authenticated via managed identity (no keys).
let containerPromise;
function getContainer() {
  if (!containerPromise) {
    const credential = new DefaultAzureCredential();
    const service = new BlobServiceClient(
      `https://${ACCOUNT}.blob.core.windows.net`,
      credential,
    );
    const client = service.getContainerClient(CONTAINER);
    containerPromise = client
      .createIfNotExists()
      .then(() => client)
      .catch(() => client);
  }
  return containerPromise;
}

function streamToString(readable) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    readable.on("data", (d) =>
      chunks.push(Buffer.isBuffer(d) ? d : Buffer.from(d)),
    );
    readable.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    readable.on("error", reject);
  });
}

// POST /api/states  — store a new immutable snapshot, return its id
app.http("createState", {
  methods: ["POST"],
  authLevel: "anonymous",
  route: "states",
  handler: async (request, context) => {
    const text = await request.text();
    if (!text || Buffer.byteLength(text) > MAX_BYTES) {
      return { status: 400, jsonBody: { error: "Empty or too large payload" } };
    }
    try {
      JSON.parse(text);
    } catch {
      return { status: 400, jsonBody: { error: "Body must be JSON" } };
    }
    try {
      const id = crypto.randomUUID();
      const container = await getContainer();
      const blob = container.getBlockBlobClient(`${id}.json`);
      await blob.upload(text, Buffer.byteLength(text), {
        blobHTTPHeaders: { blobContentType: "application/json" },
      });
      return { status: 201, jsonBody: { id } };
    } catch (e) {
      context.error("create failed", e);
      return { status: 500, jsonBody: { error: "Failed to save" } };
    }
  },
});

// GET /api/states/{id}  — fetch a snapshot
app.http("getState", {
  methods: ["GET"],
  authLevel: "anonymous",
  route: "states/{id}",
  handler: async (request, context) => {
    const id = request.params.id;
    if (!/^[A-Za-z0-9-]{8,64}$/.test(id)) {
      return { status: 400, jsonBody: { error: "Bad id" } };
    }
    try {
      const container = await getContainer();
      const blob = container.getBlockBlobClient(`${id}.json`);
      const dl = await blob.download();
      const body = await streamToString(dl.readableStreamBody);
      return {
        status: 200,
        body,
        headers: { "Content-Type": "application/json" },
      };
    } catch (e) {
      if (e.statusCode === 404) {
        return { status: 404, jsonBody: { error: "Not found" } };
      }
      context.error("get failed", e);
      return { status: 500, jsonBody: { error: "Server error" } };
    }
  },
});
