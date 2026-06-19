"use client";

import { useCallback, useMemo, useState } from "react";
import { CourseRow, RadioControl } from "@/lib/types";
import { buildSql } from "@/lib/analysis";
import { useTableSort } from "@/lib/sorting";
import SortTh from "./SortTh";

interface Props {
  rows: CourseRow[];
  selection: Record<string, RadioControl>;
  eventId: string;
  onUpdate: (control: string, patch: Partial<RadioControl>) => void;
  onSetEventId: (id: string) => void;
}

function getValue(rc: RadioControl, key: string): number | string {
  switch (key) {
    case "control":
      return Number(rc.control);
    case "name":
      return rc.name;
    default:
      return "";
  }
}

export default function SqlPanel({
  rows,
  selection,
  eventId,
  onUpdate,
  onSetEventId,
}: Props) {
  const [copied, setCopied] = useState(false);
  const controls = useMemo(() => Object.values(selection), [selection]);

  const { sorted, sortKey, sortDir, toggle } = useTableSort(
    controls,
    getValue,
    "control",
    "asc",
  );

  const sql = useMemo(
    () => buildSql(rows, sorted, eventId),
    [rows, sorted, eventId],
  );
  const sqlText = sql.map((s) => s.statement).join("\n");

  const copy = useCallback(async () => {
    await navigator.clipboard.writeText(sqlText);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }, [sqlText]);

  if (controls.length === 0) {
    return (
      <p className="p-4 text-sm text-gray-500">
        No radio controls selected. Select controls in the Export tab to generate
        SQL.
      </p>
    );
  }

  return (
    <div className="flex h-full flex-col gap-4 overflow-auto">
      <div className="flex items-center gap-2">
        <label className="text-sm font-medium">Event id (tavid):</label>
        <input
          value={eventId}
          onChange={(e) => onSetEventId(e.target.value)}
          placeholder="e.g. 33891"
          className="w-32 rounded border border-gray-300 px-2 py-1 text-sm tabular-nums"
        />
      </div>

      <div className="overflow-x-auto rounded border border-gray-200">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-left text-xs text-gray-600">
            <tr className="border-b border-gray-200">
              <SortTh label="Control" sortKey="control" activeKey={sortKey} dir={sortDir} onToggle={toggle} className="px-2 py-1.5" />
              <SortTh label="Name" sortKey="name" activeKey={sortKey} dir={sortDir} onToggle={toggle} className="px-2 py-1.5" />
            </tr>
          </thead>
          <tbody>
            {sorted.map((rc) => (
              <tr key={rc.control} className="border-b border-gray-100">
                <td className="px-2 py-1 font-semibold tabular-nums">
                  {rc.control}
                </td>
                <td className="px-2 py-1">
                  <input
                    value={rc.name}
                    onChange={(e) => onUpdate(rc.control, { name: e.target.value })}
                    placeholder="e.g. Prewarning"
                    className="w-48 rounded border border-gray-300 px-2 py-0.5 text-sm"
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex items-center justify-between">
        <span className="text-xs text-gray-500">
          {sql.length} statement{sql.length === 1 ? "" : "s"}
        </span>
        <button
          onClick={copy}
          className="rounded bg-blue-600 px-3 py-1 text-sm font-medium text-white hover:bg-blue-700"
        >
          {copied ? "Copied!" : "Copy SQL"}
        </button>
      </div>
      <textarea
        readOnly
        aria-label="Generated SQL statements"
        value={sqlText}
        spellCheck={false}
        className="min-h-64 w-full flex-1 rounded border border-gray-300 bg-gray-50 p-2 font-mono text-xs"
      />
    </div>
  );
}
