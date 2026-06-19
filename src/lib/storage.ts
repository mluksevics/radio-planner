import {
  compressToEncodedURIComponent,
  decompressFromEncodedURIComponent,
} from "lz-string";
import { AppState, APP_STATE_VERSION, PersistedState } from "./types";

const KEY = "radio-controls-state-v1";
const HASH_PREFIX = "#s=";

const API_BASE =
  process.env.NEXT_PUBLIC_API_BASE ??
  "https://radio-planner-api.azurewebsites.net";

/** Save an immutable snapshot to the server; returns its id. */
export async function saveStateToServer(state: AppState): Promise<string> {
  const payload: PersistedState = { version: APP_STATE_VERSION, ...state };
  const res = await fetch(`${API_BASE}/api/states`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(`Save failed (${res.status})`);
  const { id } = (await res.json()) as { id: string };
  return id;
}

/** Load a snapshot by id; null if it does not exist. */
export async function loadStateFromServer(id: string): Promise<AppState | null> {
  const res = await fetch(`${API_BASE}/api/states/${encodeURIComponent(id)}`);
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`Load failed (${res.status})`);
  return normalize(await res.json());
}

/** Extract a snapshot id from the current path (e.g. /a1b2c3...), or null. */
export function currentShareId(): string | null {
  if (typeof window === "undefined") return null;
  const seg = window.location.pathname.replace(/^\/+|\/+$/g, "");
  return /^[A-Za-z0-9-]{8,64}$/.test(seg) ? seg : null;
}

export function loadLocal(): AppState | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return null;
    return normalize(JSON.parse(raw));
  } catch {
    return null;
  }
}

export function saveLocal(state: AppState): void {
  if (typeof window === "undefined") return;
  try {
    const payload: PersistedState = { version: APP_STATE_VERSION, ...state };
    window.localStorage.setItem(KEY, JSON.stringify(payload));
  } catch {
    /* ignore quota errors */
  }
}

export function exportJson(state: AppState): void {
  const payload: PersistedState = { version: APP_STATE_VERSION, ...state };
  const blob = new Blob([JSON.stringify(payload, null, 2)], {
    type: "application/json",
  });
  triggerDownload(blob, "radio-controls.json");
}

export async function importJson(file: File): Promise<AppState> {
  const text = await file.text();
  return normalize(JSON.parse(text));
}

/** Build a shareable URL with the full state compressed into the hash fragment. */
export function buildShareLink(state: AppState): string {
  const payload: PersistedState = { version: APP_STATE_VERSION, ...state };
  const encoded = compressToEncodedURIComponent(JSON.stringify(payload));
  const { origin, pathname } = window.location;
  return `${origin}${pathname}${HASH_PREFIX}${encoded}`;
}

/** Decode state from the current URL hash, or null if there is none / it is invalid. */
export function decodeStateFromHash(): AppState | null {
  if (typeof window === "undefined") return null;
  const hash = window.location.hash;
  if (!hash.startsWith(HASH_PREFIX)) return null;
  try {
    const json = decompressFromEncodedURIComponent(
      hash.slice(HASH_PREFIX.length),
    );
    if (!json) return null;
    return normalize(JSON.parse(json));
  } catch {
    return null;
  }
}

function normalize(data: Partial<PersistedState>): AppState {
  return {
    rawText: typeof data.rawText === "string" ? data.rawText : "",
    rows: Array.isArray(data.rows) ? data.rows : [],
    selection:
      data.selection && typeof data.selection === "object"
        ? data.selection
        : {},
    eventId: typeof data.eventId === "string" ? data.eventId : "",
    heatmap: Boolean(data.heatmap),
    hZoom:
      typeof data.hZoom === "number" && data.hZoom > 0 ? data.hZoom : 1,
    coords:
      data.coords && typeof data.coords === "object" ? data.coords : {},
  };
}

export function triggerDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
