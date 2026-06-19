# Radio Controls Planner

A browser tool for planning **radio controls** for orienteering events. It replaces a manual
Excel workflow: load the courses for every class, see how often each control is used, and
hand‑pick the smallest set of controls that gives good radio coverage across all courses.
The selection stays **manual** — the app just makes it fast to see usage, fit and distances,
and to produce the outputs an event needs (liveresultat SQL, Excel, print, share links).

**Live:** https://orange-ground-02ee96b03.7.azurestaticapps.net

---

## Features

### Loading courses
Open the **Data** menu in the header. Supported inputs:

- **Text** – paste or upload `;`‑separated course lines (see [Data format](#text-data-format)),
  or click **Load sample** to load the bundled `public/sample.txt`.
- **OCAD course file** (`.ocd`) – parses control markers, sequence and positions into courses
  **with map coordinates** (`src/lib/ocad.ts`).
- **IOF Courses XML** (v2 grid or v3 WGS84) – parsed and projected to EPSG:3059 (LKS92 / Latvia TM)
  so it lines up with the OCAD background (`src/lib/coursesXml.ts`).
- **OCAD background map** (`.ocd`) – rendered behind the controls in the map view
  (`src/lib/ocadBackground.ts`).

### Export table (main view)
- One row per course: `class | km | S1 · controls… · F1`. Click a control to toggle it as a
  radio control; selected controls get a **stable bright colour** reused everywhere.
- **Heatmap** toggle shades controls by **usage rank** (most‑used tier = most intense), not raw count.
- **Sortable** columns, **drag‑to‑reorder** rows (default order: longest course first),
  **resizable** class column, and several leg **layout modes** (even / distance‑scaled / fill).

### Map view
- Plots controls (and start/finish) in projected coordinates over the OCAD background, when an
  OCAD/XML import provided positions. Straight‑line distances between controls are computed in
  `src/lib/distances.ts`.

### Sidebar tabs (resizable)
- **Most used controls** – `control · count · classes`, sortable; click to select/deselect.
- **Overview** – matrix of class × selected control showing cumulative km + % into the course
  (blank where a course doesn’t pass it). Columns are **drag‑reorderable**.
- **SQL** – generates `INSERT INTO liveresultat.splitcontrols …` statements; per‑control
  `code`/`name`/`corder` and a shared event id (`tavid`) are editable in‑place.

### Saving & sharing
- **Save & copy link** – uploads the current state to the server and copies an immutable
  `/{id}` link; opening it loads that exact version. One save = one version (no overwrite).
- **Save / Load JSON** – offline snapshot of the full state.
- A self‑contained `#s=…` (lz‑string compressed) link also works with no server.
- State auto‑persists to `localStorage`.

### Other
- **Export Excel** (`.xlsx`, via SheetJS) of the export / most‑used / overview / SQL views.
- **Print** to a clean report.
- Screens below the `md` breakpoint show a "not suitable for mobile" notice.

---

## Tech stack
- **Next.js** (App Router, TypeScript, Tailwind) built as a **static export** (`output: "export"`).
- Client‑side libraries: `xlsx` (Excel), `lz-string` (hash links), `proj4` + `ocad2geojson`
  (OCAD/XML parsing & projection).
- Backend: **Azure Functions** (Node) storing snapshots in **Azure Blob Storage**.

---

## Project structure
```
src/
  app/page.tsx          App shell: state reducer, tabs, persistence, share links
  components/            ExportTable, MapView, MostUsedPanel, OverviewTable, SqlPanel, …
  lib/
    parse.ts             text course parser
    ocad.ts / coursesXml.ts / ocadBackground.ts   OCAD & IOF XML import
    analysis.ts          usage counts/ranks, cumulative distance, overview, SQL
    distances.ts         straight-line distance matrix from coordinates
    heatmap.ts           heat + per-control colours
    sorting.ts           shared sort hook
    storage.ts           localStorage, JSON, #s hash, and server /{id} client
    excel.ts             .xlsx export
api/                     Azure Functions app (state snapshot API)
public/                  sample.txt, staticwebapp.config.json (SPA fallback for /{id})
.github/workflows/       SWA deploy + keyless API deploy
```

---

## Local development
```bash
npm install
npm run dev      # http://localhost:3000
npm run build    # static export to ./out
```
The frontend calls the API at `NEXT_PUBLIC_API_BASE` (defaults to the deployed Function App).

To run the API locally you need [Azure Functions Core Tools](https://learn.microsoft.com/azure/azure-functions/functions-run-local):
```bash
cd api
npm install
func start       # http://localhost:7071
```

---

## Deployment & infrastructure (Azure)

Two independently deployed pieces, both keyless from the repo’s point of view:

| Piece | Hosting | Deploy trigger |
| --- | --- | --- |
| Frontend (`out/`) | Azure **Static Web App** `radio-planner` (Free) | `.github/workflows/azure-static-web-apps.yml` on push |
| API (`api/`) | Azure **Function App** `radio-planner-api` (Consumption, Linux/Node) | `.github/workflows/deploy-api.yml` on push to `api/**` |

**State storage:** snapshots are JSON blobs in the `states` container of the storage account.
The Function App reads/writes them via its **system‑assigned managed identity** (RBAC role
*Storage Blob Data Contributor*) using `DefaultAzureCredential` — **no storage keys in code or repo**.

**`/{id}` routing:** `public/staticwebapp.config.json` rewrites unknown paths to `/index.html`,
so a share link like `/<guid>` serves the app, which then fetches the snapshot from the API.

### Credentials posture
- **Nothing secret is committed.** No connection strings, keys, or publish profiles in git.
- API CI auth uses **GitHub OIDC** federated to a **user‑assigned managed identity**
  (`radio-planner-gh-deploy`, *Contributor* on the Function App). The only GitHub secrets are
  the non‑sensitive `AZURE_CLIENT_ID` / `AZURE_TENANT_ID` / `AZURE_SUBSCRIPTION_ID`; the actual
  token is minted per‑run.
- The SWA deploy uses the SWA deployment token (GitHub secret `AZURE_STATIC_WEB_APPS_API_TOKEN`).
- Data access uses managed identity end to end; the only keys that exist are Azure‑internal
  platform settings (`AzureWebJobsStorage`, run‑from‑package SAS) that live in Azure config, never in git.

### API endpoints
- `POST /api/states` → `{ id }` — store an immutable snapshot (≤ 4 MB JSON).
- `GET  /api/states/{id}` → the snapshot JSON, or `404`.

Running cost is effectively ~$0 (Consumption free grant + a few KB of blobs).

---

## <a id="text-data-format"></a>Text data format
One course per line, `;`‑separated:
```
classes ; course ; 0 ; length ; climb ; START ; legDist ; control ; legDist ; control ; … ; legDist ; F1
```
- Field 0 is a space‑separated list of classes sharing the course (e.g. `W8 M8 W10 M10`).
- Control/leg pairs start at index 6; `F1` marks the finish.
- Cumulative distance to a control = sum of leg distances up to it; ratio = cumulative ÷ length.
