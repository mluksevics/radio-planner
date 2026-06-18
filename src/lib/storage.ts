import {
  compressToEncodedURIComponent,
  decompressFromEncodedURIComponent,
} from "lz-string";
import { AppState, APP_STATE_VERSION, PersistedState } from "./types";

const KEY = "radio-controls-state-v1";
const HASH_PREFIX = "#s=";

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
