"use client";

import { useEffect, useMemo, useReducer, useState } from "react";
import { AppState, RadioControl } from "@/lib/types";
import { parseCourses } from "@/lib/parse";
import { controlUsage } from "@/lib/analysis";
import { loadLocal, saveLocal, exportJson, importJson } from "@/lib/storage";
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
    case "SET_DATA":
      return { ...state, rawText: action.rawText, rows: parseCourses(action.rawText) };
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

type Tab = "export" | "overview" | "sql";

export default function Home() {
  const [state, dispatch] = useReducer(reducer, initialState);
  const [tab, setTab] = useState<Tab>("export");
  const [showData, setShowData] = useState(true);
  const [hydrated, setHydrated] = useState(false);

  // hydrate from localStorage once on mount
  useEffect(() => {
    const saved = loadLocal();
    if (saved) {
      dispatch({ type: "LOAD_STATE", state: saved });
      if (saved.rows.length > 0) setShowData(false);
    }
    setHydrated(true);
  }, []);

  // persist after hydration
  useEffect(() => {
    if (hydrated) saveLocal(state);
  }, [state, hydrated]);

  const usage = useMemo(() => controlUsage(state.rows), [state.rows]);
  const maxUsage = usage.length ? usage[0].count : 0;
  const usageMap = useMemo(() => {
    const m = new Map<string, number>();
    for (const u of usage) m.set(u.control, u.count);
    return m;
  }, [usage]);
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
    <main className="mx-auto max-w-[1600px] p-4">
      <header className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold">Radio Controls Planner</h1>
          <p className="text-xs text-gray-500">
            {state.rows.length} courses · {usage.length} controls ·{" "}
            {selectedControls.length} radio controls selected
          </p>
        </div>
        <Toolbar
          heatmap={state.heatmap}
          onToggleHeatmap={() => dispatch({ type: "TOGGLE_HEATMAP" })}
          onSaveJson={() => exportJson(state)}
          onLoadJson={handleLoadJson}
          onExportExcel={() => exportXlsx(state)}
          onPrint={() => window.print()}
        />
      </header>

      <section className="mb-4 rounded border border-gray-200 print:hidden">
        <button
          onClick={() => setShowData((v) => !v)}
          className="flex w-full items-center justify-between px-3 py-2 text-sm font-medium"
        >
          <span>Data</span>
          <span className="text-gray-400">{showData ? "▲" : "▼"}</span>
        </button>
        {showData && (
          <div className="border-t border-gray-200 p-3">
            <DataInput
              initialText={state.rawText}
              onLoad={(text) => {
                dispatch({ type: "SET_DATA", rawText: text });
                setShowData(false);
              }}
            />
          </div>
        )}
      </section>

      <nav className="mb-3 flex gap-1 border-b border-gray-200 print:hidden">
        {(
          [
            ["export", "Export"],
            ["overview", "Overview"],
            ["sql", "SQL"],
          ] as [Tab, string][]
        ).map(([key, label]) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`-mb-px border-b-2 px-4 py-2 text-sm font-medium ${
              tab === key
                ? "border-blue-600 text-blue-600"
                : "border-transparent text-gray-500 hover:text-gray-800"
            }`}
          >
            {label}
          </button>
        ))}
      </nav>

      {tab === "export" && (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_320px]">
          <ExportTable
            rows={state.rows}
            selection={state.selection}
            usage={usageMap}
            maxUsage={maxUsage}
            heatmap={state.heatmap}
            onToggle={(control) => dispatch({ type: "TOGGLE_CONTROL", control })}
          />
          <aside className="print:hidden">
            <MostUsedPanel
              usage={usage}
              maxUsage={maxUsage}
              selection={state.selection}
              onToggle={(control) =>
                dispatch({ type: "TOGGLE_CONTROL", control })
              }
            />
          </aside>
        </div>
      )}

      {tab === "overview" && (
        <OverviewTable rows={state.rows} controls={selectedControls} />
      )}

      {tab === "sql" && (
        <SqlPanel
          rows={state.rows}
          selection={state.selection}
          eventId={state.eventId}
          onUpdate={(control, patch) =>
            dispatch({ type: "UPDATE_RC", control, patch })
          }
          onSetEventId={(eventId) => dispatch({ type: "SET_EVENT_ID", eventId })}
        />
      )}
    </main>
  );
}
