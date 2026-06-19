"use client";

import { ControlUsage } from "@/lib/analysis";
import { heatColor, radioColor } from "@/lib/heatmap";
import { useTableSort } from "@/lib/sorting";
import SortTh from "./SortTh";

interface Props {
  usage: ControlUsage[];
  heatRank: Map<string, number>;
  maxRank: number;
  selection: Record<string, unknown>;
  onToggle: (control: string) => void;
}

function getValue(u: ControlUsage, key: string): number | string {
  switch (key) {
    case "control":
      return u.control;
    case "count":
      return u.count;
    default:
      return "";
  }
}

export default function MostUsedPanel({
  usage,
  heatRank,
  maxRank,
  selection,
  onToggle,
}: Props) {
  const selectedCount = usage.filter((u) => u.control in selection).length;
  const { sorted, sortKey, sortDir, toggle } = useTableSort(
    usage,
    (u, key) =>
      key === "selected" ? (u.control in selection ? 0 : 1) : getValue(u, key),
    "count",
    "desc",
  );

  return (
    <div className="flex h-full flex-col">
      <div className="mb-2 flex items-baseline justify-end gap-3">
        <span className="text-xs text-gray-500">
          {usage.length} used controls
        </span>
        <span className="text-xs text-gray-500">{selectedCount} selected</span>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto rounded border border-gray-200">
        <table className="w-full text-xs">
          <thead className="sticky top-0 bg-gray-50 text-gray-600">
            <tr className="border-b border-gray-200 text-left">
              <th className="px-2 py-1.5 text-right font-medium text-gray-400">
                №
              </th>
              <SortTh
                label="Ctrl"
                sortKey="control"
                activeKey={sortKey}
                dir={sortDir}
                onToggle={toggle}
                className="px-2 py-1.5"
              />
              <SortTh
                label="#"
                sortKey="count"
                activeKey={sortKey}
                dir={sortDir}
                onToggle={toggle}
                className="px-2 py-1.5"
              />
              <SortTh
                label="Sel"
                sortKey="selected"
                activeKey={sortKey}
                dir={sortDir}
                onToggle={toggle}
                className="px-1 py-1.5"
              />
              <th className="px-2 py-1.5">Classes</th>
            </tr>
          </thead>
          <tbody>
            {sorted.length === 0 && (
              <tr>
                <td colSpan={5} className="p-3 text-gray-500">
                  No data.
                </td>
              </tr>
            )}
            {sorted.map((u, i) => {
              const selected = u.control in selection;
              return (
                <tr
                  key={u.control}
                  onClick={() => onToggle(u.control)}
                  className={`cursor-pointer border-b border-gray-100 last:border-b-0 hover:bg-gray-50 ${
                    selected ? "bg-emerald-50" : ""
                  }`}
                  title={u.classes.join(" ")}
                >
                  <td className="px-2 py-1 text-right tabular-nums text-gray-400">
                    {i + 1}
                  </td>
                  <td className="px-2 py-1">
                    <span className="inline-flex items-center gap-1.5">
                      <span
                        className="inline-block h-3 w-3 shrink-0 rounded-sm"
                        style={{
                          backgroundColor: selected
                            ? radioColor(u.control)
                            : heatColor(heatRank.get(u.control) ?? 0, maxRank),
                        }}
                      />
                      <span
                        className="font-semibold tabular-nums"
                        style={
                          selected ? { color: radioColor(u.control) } : undefined
                        }
                      >
                        {u.control}
                      </span>
                    </span>
                  </td>
                  <td className="px-2 py-1 text-right tabular-nums text-gray-500">
                    {u.count}
                  </td>
                  <td className="px-1 py-1 text-center text-emerald-600">
                    {selected ? "✓" : ""}
                  </td>
                  <td className="max-w-[180px] truncate px-2 py-1 text-[11px] text-gray-400">
                    {u.classes.join(" ")}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
