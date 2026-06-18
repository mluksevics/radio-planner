"use client";

import { useMemo, useState } from "react";
import { CourseRow } from "@/lib/types";
import { FINISH } from "@/lib/analysis";
import { heatColor, heatText, radioColor } from "@/lib/heatmap";
import { compareValues, SortDir } from "@/lib/sorting";

interface Props {
  rows: CourseRow[];
  selection: Record<string, unknown>;
  usage: Map<string, number>;
  heatRank: Map<string, number>;
  maxRank: number;
  heatmap: boolean;
  onToggle: (control: string) => void;
  onReorder: (rows: CourseRow[]) => void;
}

const CLASS_W = "w-56";
const LEN_W = "w-14";
const CTRL_W = "w-16";

function getValue(row: CourseRow, key: string): number | string {
  switch (key) {
    case "class":
      return row.classLabel;
    case "length":
      return row.length;
    case "controls":
      return row.legs.filter((l) => l.code !== FINISH).length;
    default:
      return "";
  }
}

function move<T>(arr: T[], from: number, to: number): T[] {
  const copy = [...arr];
  const [item] = copy.splice(from, 1);
  copy.splice(to, 0, item);
  return copy;
}

export default function ExportTable({
  rows,
  selection,
  usage,
  heatRank,
  maxRank,
  heatmap,
  onToggle,
  onReorder,
}: Props) {
  // null sort = manual order (rows as given / drag-reordered)
  const [sort, setSort] = useState<{ key: string; dir: SortDir } | null>(null);
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [overIndex, setOverIndex] = useState<number | null>(null);

  const view = useMemo(() => {
    if (!sort) return rows;
    const indexed = rows.map((r, i) => [r, i] as [CourseRow, number]);
    indexed.sort((x, y) => {
      const c = compareValues(getValue(x[0], sort.key), getValue(y[0], sort.key));
      return (sort.dir === "asc" ? c : -c) || x[1] - y[1];
    });
    return indexed.map((p) => p[0]);
  }, [rows, sort]);

  function toggleSort(key: string) {
    setSort((s) =>
      s && s.key === key
        ? { key, dir: s.dir === "asc" ? "desc" : "asc" }
        : { key, dir: "asc" },
    );
  }

  function handleDrop(target: number) {
    if (dragIndex !== null && dragIndex !== target) {
      onReorder(move(view, dragIndex, target));
      setSort(null); // manual order becomes the source of truth
    }
    setDragIndex(null);
    setOverIndex(null);
  }

  if (rows.length === 0) {
    return (
      <p className="p-4 text-sm text-gray-500">
        No data loaded. Use the Data menu in the header to load courses.
      </p>
    );
  }

  const SortLabel = ({ k, label }: { k: string; label: string }) => (
    <button
      onClick={() => toggleSort(k)}
      className="inline-flex items-center gap-0.5 hover:text-gray-900"
      title="Click to sort"
    >
      {label}
      <span
        className={`text-[9px] ${sort?.key === k ? "text-gray-700" : "text-gray-300"}`}
      >
        {sort?.key === k ? (sort.dir === "asc" ? "▲" : "▼") : "↕"}
      </span>
    </button>
  );

  return (
    <div className="h-full overflow-auto rounded border border-gray-200">
      <div className="min-w-max">
        {/* header */}
        <div className="sticky top-0 z-20 flex items-stretch border-b border-gray-200 bg-gray-50 text-xs font-semibold text-gray-600">
          <div className="sticky left-0 z-10 flex shrink-0 items-center gap-2 border-r border-gray-200 bg-gray-50 px-2 py-1.5">
            <span className="w-4 text-gray-300" title="Drag rows to reorder">
              ⠿
            </span>
            <span className={CLASS_W}>
              <SortLabel k="class" label="Class" />
            </span>
            <span className={`${LEN_W} text-right`}>
              <SortLabel k="length" label="km" />
            </span>
          </div>
          <div className="flex items-center px-3 py-1.5 text-gray-400">
            <SortLabel k="controls" label="controls →" />
          </div>
        </div>

        {/* body */}
        {view.map((row, i) => {
          let cum = 0;
          return (
            <div
              key={`${row.classLabel}-${row.course}-${i}`}
              draggable
              onDragStart={() => setDragIndex(i)}
              onDragOver={(e) => {
                e.preventDefault();
                if (overIndex !== i) setOverIndex(i);
              }}
              onDrop={() => handleDrop(i)}
              onDragEnd={() => {
                setDragIndex(null);
                setOverIndex(null);
              }}
              className={`flex items-stretch border-b border-gray-100 last:border-b-0 hover:bg-gray-50/60 ${
                overIndex === i && dragIndex !== null && dragIndex !== i
                  ? "border-t-2 border-t-blue-400"
                  : ""
              } ${dragIndex === i ? "opacity-40" : ""}`}
            >
              <div className="sticky left-0 z-10 flex shrink-0 items-center gap-2 border-r border-gray-200 bg-white px-2 py-1">
                <span className="w-4 cursor-grab text-gray-300 active:cursor-grabbing">
                  ⠿
                </span>
                <span
                  className={`${CLASS_W} truncate text-xs font-semibold`}
                  title={row.classLabel}
                >
                  {row.classLabel}
                </span>
                <span
                  className={`${LEN_W} text-right text-xs tabular-nums text-gray-500`}
                >
                  {row.length}
                </span>
              </div>
              <div className="flex items-stretch gap-0.5 py-1 pl-2">
                <div
                  className={`flex ${CTRL_W} shrink-0 flex-col items-center justify-start`}
                >
                  <span className="rounded bg-gray-100 px-1.5 py-0.5 text-xs font-medium text-gray-600">
                    {row.start}
                  </span>
                </div>
                {row.legs.map((leg, j) => {
                  cum += leg.dist;
                  const isFinish = leg.code === FINISH;
                  const selected = !isFinish && leg.code in selection;
                  const count = usage.get(leg.code) ?? 0;
                  const rank = heatRank.get(leg.code) ?? 0;
                  const heat = heatmap && !isFinish;
                  const pct =
                    row.length > 0 ? Math.round((cum / row.length) * 100) : 0;
                  const style = selected
                    ? { backgroundColor: radioColor(leg.code), color: "#fff" }
                    : heat
                      ? {
                          backgroundColor: heatColor(rank, maxRank),
                          color: heatText(rank, maxRank),
                        }
                      : undefined;
                  return (
                    <div
                      key={j}
                      className={`flex ${CTRL_W} shrink-0 flex-col items-center justify-start gap-0.5`}
                    >
                      {isFinish ? (
                        <span className="rounded bg-gray-100 px-1.5 py-0.5 text-xs font-medium text-gray-600">
                          {leg.code}
                        </span>
                      ) : (
                        <button
                          onClick={() => onToggle(leg.code)}
                          style={style}
                          title={`Control ${leg.code} — used ${count}×`}
                          className={`w-full rounded px-1.5 py-0.5 text-center text-xs font-semibold tabular-nums transition ${
                            selected
                              ? "shadow-sm ring-1 ring-black/10"
                              : "hover:ring-1 hover:ring-gray-300"
                          } ${!selected && !heat ? "bg-gray-50 text-gray-800" : ""}`}
                        >
                          {leg.code}
                        </button>
                      )}
                      {selected && (
                        <span
                          className="text-[9px] font-semibold tabular-nums"
                          style={{ color: radioColor(leg.code) }}
                        >
                          {pct}%
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
