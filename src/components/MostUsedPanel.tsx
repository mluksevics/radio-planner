"use client";

import { ControlUsage } from "@/lib/analysis";
import { heatColor } from "@/lib/heatmap";

interface Props {
  usage: ControlUsage[];
  maxUsage: number;
  selection: Record<string, unknown>;
  onToggle: (control: string) => void;
}

export default function MostUsedPanel({
  usage,
  maxUsage,
  selection,
  onToggle,
}: Props) {
  const selectedCount = usage.filter((u) => u.control in selection).length;

  return (
    <div className="flex h-full flex-col">
      <div className="mb-2 flex items-baseline justify-between">
        <h2 className="text-sm font-semibold">Most used controls</h2>
        <span className="text-xs text-gray-500">
          {selectedCount} selected
        </span>
      </div>
      <div className="flex-1 overflow-y-auto rounded border border-gray-200">
        {usage.length === 0 && (
          <p className="p-3 text-xs text-gray-500">No data.</p>
        )}
        {usage.map((u) => {
          const selected = u.control in selection;
          return (
            <button
              key={u.control}
              onClick={() => onToggle(u.control)}
              className={`flex w-full items-center gap-2 border-b border-gray-100 px-2 py-1 text-left last:border-b-0 hover:bg-gray-50 ${
                selected ? "bg-emerald-50" : ""
              }`}
              title={u.classes.join(" ")}
            >
              <span
                className="inline-block h-3 w-3 shrink-0 rounded-sm"
                style={{ backgroundColor: heatColor(u.count, maxUsage) }}
              />
              <span
                className={`w-10 text-xs font-semibold tabular-nums ${
                  selected ? "text-emerald-700" : ""
                }`}
              >
                {u.control}
              </span>
              <span className="w-8 text-right text-xs tabular-nums text-gray-500">
                {u.count}
              </span>
              <span className="flex-1 truncate text-[11px] text-gray-400">
                {u.classes.join(" ")}
              </span>
              {selected && (
                <span className="text-xs font-bold text-emerald-600">✓</span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
