"use client";

import { useMemo, useState } from "react";
import { CourseRow, RadioControl } from "@/lib/types";
import { buildSql } from "@/lib/analysis";

interface Props {
  rows: CourseRow[];
  selection: Record<string, RadioControl>;
  eventId: string;
  onUpdate: (control: string, patch: Partial<RadioControl>) => void;
  onSetEventId: (id: string) => void;
}

export default function SqlPanel({
  rows,
  selection,
  eventId,
  onUpdate,
  onSetEventId,
}: Props) {
  const [copied, setCopied] = useState(false);
  const controls = Object.values(selection).sort((a, b) =>
    numeric(a.control, b.control),
  );

  const sql = useMemo(
    () => buildSql(rows, controls, eventId),
    [rows, controls, eventId],
  );
  const sqlText = sql.map((s) => s.statement).join("\n");

  async function copy() {
    await navigator.clipboard.writeText(sqlText);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  if (controls.length === 0) {
    return (
      <p className="p-4 text-sm text-gray-500">
        No radio controls selected. Select controls in the Export tab to generate
        SQL.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-4">
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
          <thead className="bg-gray-50 text-left text-xs text-gray-500">
            <tr className="border-b border-gray-200">
              <th className="px-2 py-1.5">Control</th>
              <th className="px-2 py-1.5">liveresultat code</th>
              <th className="px-2 py-1.5">Name</th>
              <th className="px-2 py-1.5">corder</th>
            </tr>
          </thead>
          <tbody>
            {controls.map((rc) => (
              <tr key={rc.control} className="border-b border-gray-100">
                <td className="px-2 py-1 font-semibold tabular-nums">
                  {rc.control}
                </td>
                <td className="px-2 py-1">
                  <input
                    value={rc.code}
                    onChange={(e) =>
                      onUpdate(rc.control, { code: e.target.value })
                    }
                    placeholder={rc.control}
                    className="w-28 rounded border border-gray-300 px-2 py-0.5 text-sm tabular-nums"
                  />
                </td>
                <td className="px-2 py-1">
                  <input
                    value={rc.name}
                    onChange={(e) =>
                      onUpdate(rc.control, { name: e.target.value })
                    }
                    placeholder="e.g. Prewarning"
                    className="w-48 rounded border border-gray-300 px-2 py-0.5 text-sm"
                  />
                </td>
                <td className="px-2 py-1">
                  <input
                    value={rc.corder}
                    onChange={(e) =>
                      onUpdate(rc.control, {
                        corder: Number(e.target.value) || 0,
                      })
                    }
                    className="w-16 rounded border border-gray-300 px-2 py-0.5 text-sm tabular-nums"
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
        value={sqlText}
        spellCheck={false}
        className="h-64 w-full rounded border border-gray-300 bg-gray-50 p-2 font-mono text-xs"
      />
    </div>
  );
}

function numeric(a: string, b: string): number {
  const na = Number(a);
  const nb = Number(b);
  if (Number.isFinite(na) && Number.isFinite(nb)) return na - nb;
  return a.localeCompare(b);
}
