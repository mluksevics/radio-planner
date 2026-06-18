"use client";

import { CourseRow } from "@/lib/types";
import { FINISH } from "@/lib/analysis";
import { heatColor, heatText } from "@/lib/heatmap";

interface Props {
  rows: CourseRow[];
  selection: Record<string, unknown>;
  usage: Map<string, number>;
  maxUsage: number;
  heatmap: boolean;
  onToggle: (control: string) => void;
}

export default function ExportTable({
  rows,
  selection,
  usage,
  maxUsage,
  heatmap,
  onToggle,
}: Props) {
  if (rows.length === 0) {
    return (
      <p className="p-4 text-sm text-gray-500">
        No data loaded. Use the Data panel above to load courses.
      </p>
    );
  }

  return (
    <div className="overflow-x-auto rounded border border-gray-200">
      <div className="min-w-max">
        {rows.map((row, i) => (
          <div
            key={i}
            className="flex items-stretch border-b border-gray-100 last:border-b-0"
          >
            <div className="sticky left-0 z-10 flex shrink-0 items-center gap-2 border-r border-gray-200 bg-white px-2 py-1">
              <span className="w-40 truncate text-xs font-semibold" title={row.classLabel}>
                {row.classLabel}
              </span>
              <span className="w-20 truncate text-xs text-gray-500" title={row.course}>
                {row.course}
              </span>
              <span className="w-12 text-right text-xs tabular-nums text-gray-500">
                {row.length}
              </span>
            </div>
            <div className="flex items-center gap-0.5 py-1 pl-2">
              <span className="rounded bg-gray-100 px-1.5 py-0.5 text-xs font-medium text-gray-600">
                {row.start}
              </span>
              {row.legs.map((leg, j) => {
                const isFinish = leg.code === FINISH;
                const selected = !isFinish && leg.code in selection;
                const count = usage.get(leg.code) ?? 0;
                const heat = heatmap && !isFinish;
                const style = heat
                  ? {
                      backgroundColor: heatColor(count, maxUsage),
                      color: heatText(count, maxUsage),
                    }
                  : undefined;
                return (
                  <span key={j} className="flex items-center">
                    <span className="px-0.5 text-[10px] tabular-nums text-gray-400">
                      {leg.dist.toFixed(3)}
                    </span>
                    {isFinish ? (
                      <span className="rounded bg-gray-100 px-1.5 py-0.5 text-xs font-medium text-gray-600">
                        {leg.code}
                      </span>
                    ) : (
                      <button
                        onClick={() => onToggle(leg.code)}
                        style={style}
                        title={`Control ${leg.code} — used ${count}×`}
                        className={`min-w-7 rounded px-1.5 py-0.5 text-center text-xs font-semibold tabular-nums transition ${
                          selected
                            ? "ring-2 ring-emerald-500 ring-offset-1"
                            : "hover:ring-1 hover:ring-gray-300"
                        } ${
                          selected && !heat
                            ? "bg-emerald-500 text-white"
                            : !heat
                              ? "bg-gray-50 text-gray-800"
                              : ""
                        }`}
                      >
                        {leg.code}
                      </button>
                    )}
                  </span>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
