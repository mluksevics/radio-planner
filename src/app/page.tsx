"use client";

import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react";
import { AppState, CourseRow, RadioControl } from "@/lib/types";
import { parseCourses } from "@/lib/parse";
import { controlUsage, usageRanks } from "@/lib/analysis";
import {
  loadLocal,
  saveLocal,
  exportJson,
  importJson,
  decodeStateFromHash,
  saveStateToServer,
  loadStateFromServer,
  currentShareId,
} from "@/lib/storage";
import { exportXlsx } from "@/lib/excel";
import Toolbar from "@/components/Toolbar";
import DataInput from "@/components/DataInput";
import ExportTable from "@/components/ExportTable";
import MostUsedPanel from "@/components/MostUsedPanel";
import OverviewTable from "@/components/OverviewTable";
import SqlPanel from "@/components/SqlPanel";

type Action =
  | { type: "SET_DATA"; rawText: string }
  | { type: "TOGGLE_CONTROL"; control: string }
  | { type: "UPDATE_RC"; control: string; patch: Partial<RadioControl> }
  | { type: "SET_EVENT_ID"; eventId: string }
  | { type: "TOGGLE_HEATMAP" }
  | { type: "REORDER_ROWS"; rows: CourseRow[] }
  | { type: "LOAD_STATE"; state: AppState };

const initialState: AppState = {
  rawText: "",
  rows: [],
  selection: {},
  eventId: "",
  heatmap: false,
};

function reducer(state: AppState, action: Action): AppState {
  switch (action.type) {
    case "SET_DATA": {
      // default order: longest course at the top
      const rows = parseCourses(action.rawText).sort(
        (a, b) => b.length - a.length,
      );
      return { ...state, rawText: action.rawText, rows };
    }
    case "REORDER_ROWS":
      return { ...state, rows: action.rows };
    case "TOGGLE_CONTROL": {
      const selection = { ...state.selection };
      if (selection[action.control]) {
        delete selection[action.control];
      } else {
        selection[action.control] = {
          control: action.control,
          code: "",
          name: "",
          corder: 0,
        };
      }
      return { ...state, selection };
    }
    case "UPDATE_RC": {
      const cur = state.selection[action.control];
      if (!cur) return state;
      return {
        ...state,
        selection: {
          ...state.selection,
          [action.control]: { ...cur, ...action.patch },
        },
      };
    }
    case "SET_EVENT_ID":
      return { ...state, eventId: action.eventId };
    case "TOGGLE_HEATMAP":
      return { ...state, heatmap: !state.heatmap };
    case "LOAD_STATE":
      return action.state;
    default:
      return state;
  }
}

type SideTab = "used" | "overview" | "sql";

const SIDEBAR_MIN = 260;
const SIDEBAR_KEY = "radio-sidebar-width";

export default function Home() {
  const [state, dispatch] = useReducer(reducer, initialState);
  const [sideTab, setSideTab] = useState<SideTab>("used");
  const [showData, setShowData] = useState(false);
  const [hydrated, setHydrated] = useState(false);
  const [sidebarWidth, setSidebarWidth] = useState(380);
  const [linkCopied, setLinkCopied] = useState(false);
  const [linkSaving, setLinkSaving] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const draggingRef = useRef(false);

  // hydrate on mount: /{id} shared link > URL hash > locally saved state
  useEffect(() => {
    const id = currentShareId();
    if (id) {
      loadStateFromServer(id)
        .then((s) => {
          if (s) {
            dispatch({ type: "LOAD_STATE", state: s });
            if (s.rows.length > 0) setShowData(false);
          } else {
            setLoadError("This shared link was not found.");
          }
        })
        .catch(() => setLoadError("Could not load the shared link."))
        .finally(() => setHydrated(true));
      return;
    }
    const shared = decodeStateFromHash();
    const saved = shared ?? loadLocal();
    if (saved) {
      dispatch({ type: "LOAD_STATE", state: saved });
      if (saved.rows.length > 0) setShowData(false);
    }
    setHydrated(true);
  }, []);

  async function handleCopyLink() {
    setLinkSaving(true);
    try {
      const id = await saveStateToServer(state);
      const link = `${window.location.origin}/${id}`;
      await navigator.clipboard.writeText(link);
      window.history.replaceState(null, "", `/${id}`);
      setLinkCopied(true);
      setTimeout(() => setLinkCopied(false), 2200);
    } catch {
      alert("Could not save and copy the link. Please try again.");
    } finally {
      setLinkSaving(false);
    }
  }

  // persist after hydration
  useEffect(() => {
    if (hydrated) saveLocal(state);
  }, [state, hydrated]);

  // restore + persist sidebar width
  useEffect(() => {
    const w = Number(window.localStorage.getItem(SIDEBAR_KEY));
    if (Number.isFinite(w) && w >= SIDEBAR_MIN) setSidebarWidth(w);
  }, []);

  const sidebarWidthRef = useRef(sidebarWidth);
  sidebarWidthRef.current = sidebarWidth;

  const startResize = useCallback(() => {
    draggingRef.current = true;
    const onMove = (e: MouseEvent) => {
      if (!draggingRef.current) return;
      const max = window.innerWidth * 0.75;
      const w = Math.min(max, Math.max(SIDEBAR_MIN, window.innerWidth - e.clientX - 12));
      setSidebarWidth(w);
    };
    const onUp = () => {
      draggingRef.current = false;
      window.localStorage.setItem(
        SIDEBAR_KEY,
        String(Math.round(sidebarWidthRef.current)),
      );
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
      document.body.style.userSelect = "";
    };
    document.body.style.userSelect = "none";
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
  }, []);

  const usage = useMemo(() => controlUsage(state.rows), [state.rows]);
  const usageMap = useMemo(() => {
    const m = new Map<string, number>();
    for (const u of usage) m.set(u.control, u.count);
    return m;
  }, [usage]);
  const { rank: heatRank, maxRank } = useMemo(() => usageRanks(usage), [usage]);
  const selectedControls = useMemo(
    () =>
      Object.keys(state.selection).sort((a, b) => {
        const na = Number(a);
        const nb = Number(b);
        return Number.isFinite(na) && Number.isFinite(nb)
          ? na - nb
          : a.localeCompare(b);
      }),
    [state.selection],
  );

  async function handleLoadJson(file: File) {
    try {
      const loaded = await importJson(file);
      dispatch({ type: "LOAD_STATE", state: loaded });
      if (loaded.rows.length > 0) setShowData(false);
    } catch {
      alert("Could not read JSON file.");
    }
  }

  return (
    <>
      <div className="flex h-screen flex-col items-center justify-center gap-2 p-8 text-center md:hidden print:hidden">
        <h1 className="text-lg font-bold">Radio Controls Planner</h1>
        <p className="text-sm text-gray-500">
          Not suitable for mobile. Please open on a desktop or wider screen.
        </p>
      </div>
      <main className="hidden h-screen flex-col gap-2 p-3 md:flex print:flex print:h-auto print:block">
      <header className="flex flex-wrap items-center justify-between gap-3 print:hidden">
        <div className="flex items-baseline gap-3">
          <h1 className="text-lg font-bold whitespace-nowrap">
            Radio Controls Planner
          </h1>
          <p className="text-xs text-gray-500 whitespace-nowrap">
            {state.rows.length} courses · {usage.length} controls ·{" "}
            {selectedControls.length} radio
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative">
            <button
              onClick={() => setShowData((v) => !v)}
              className="rounded border border-gray-300 px-3 py-1.5 text-sm font-medium hover:bg-gray-50"
            >
              Data ▾
            </button>
            {showData && (
              <>
                <div
                  className="fixed inset-0 z-40"
                  onClick={() => setShowData(false)}
                />
                <div className="absolute right-0 top-full z-50 mt-1 w-[min(90vw,640px)] rounded border border-gray-200 bg-white p-3 shadow-lg">
                  <DataInput
                    initialText={state.rawText}
                    onLoad={(text) => {
                      dispatch({ type: "SET_DATA", rawText: text });
                      setShowData(false);
                    }}
                  />
                </div>
              </>
            )}
          </div>
          <Toolbar
            heatmap={state.heatmap}
            onToggleHeatmap={() => dispatch({ type: "TOGGLE_HEATMAP" })}
            onSaveJson={() => exportJson(state)}
            onLoadJson={handleLoadJson}
            onExportExcel={() => exportXlsx(state)}
            onCopyLink={handleCopyLink}
            linkCopied={linkCopied}
            linkSaving={linkSaving}
            onPrint={() => window.print()}
          />
        </div>
      </header>

      {loadError && (
        <div className="flex items-center justify-between rounded border border-amber-300 bg-amber-50 px-3 py-1.5 text-sm text-amber-800 print:hidden">
          <span>{loadError}</span>
          <button
            onClick={() => setLoadError(null)}
            className="ml-3 rounded px-2 text-amber-700 hover:bg-amber-100"
          >
            ✕
          </button>
        </div>
      )}

      <div className="flex min-h-0 flex-1 gap-0 print:block print:min-h-0">
        {/* main export view — always visible */}
        <div className="min-w-0 flex-1 print:w-full">
          <ExportTable
            rows={state.rows}
            selection={state.selection}
            usage={usageMap}
            heatRank={heatRank}
            maxRank={maxRank}
            heatmap={state.heatmap}
            onToggle={(control) => dispatch({ type: "TOGGLE_CONTROL", control })}
            onReorder={(rows) => dispatch({ type: "REORDER_ROWS", rows })}
          />
        </div>

        {/* resize handle */}
        <div
          onMouseDown={startResize}
          className="mx-1 w-1.5 shrink-0 cursor-col-resize rounded bg-gray-200 hover:bg-blue-400 print:hidden"
          title="Drag to resize"
        />

        {/* tabbed sidebar */}
        <aside
          style={{ width: sidebarWidth }}
          className="flex min-h-0 shrink-0 flex-col print:hidden"
        >
          <nav className="flex shrink-0 gap-1 border-b border-gray-200">
            {(
              [
                ["used", "Most used controls"],
                ["overview", "Overview"],
                ["sql", "SQL"],
              ] as [SideTab, string][]
            ).map(([key, label]) => (
              <button
                key={key}
                onClick={() => setSideTab(key)}
                className={`-mb-px border-b-2 px-3 py-1.5 text-sm font-medium whitespace-nowrap ${
                  sideTab === key
                    ? "border-blue-600 text-blue-600"
                    : "border-transparent text-gray-500 hover:text-gray-800"
                }`}
              >
                {label}
              </button>
            ))}
          </nav>

          <div className="min-h-0 flex-1 pt-2">
            {sideTab === "used" && (
              <MostUsedPanel
                usage={usage}
                heatRank={heatRank}
                maxRank={maxRank}
                selection={state.selection}
                onToggle={(control) =>
                  dispatch({ type: "TOGGLE_CONTROL", control })
                }
              />
            )}
            {sideTab === "overview" && (
              <OverviewTable rows={state.rows} controls={selectedControls} />
            )}
            {sideTab === "sql" && (
              <SqlPanel
                rows={state.rows}
                selection={state.selection}
                eventId={state.eventId}
                onUpdate={(control, patch) =>
                  dispatch({ type: "UPDATE_RC", control, patch })
                }
                onSetEventId={(eventId) =>
                  dispatch({ type: "SET_EVENT_ID", eventId })
                }
              />
            )}
          </div>
        </aside>
      </div>
      </main>
    </>
  );
}
