"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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

const LEN_W = "w-14";
const CTRL_W = "w-[3.2rem]";
const CLASS_MIN = 50;
const CLASS_KEY = "radio-class-width";

// stretched-layout geometry (px)
const TRACK_W = 860;
const BOX_W = 50;
const BOX_H = 24;
// minimum left-to-left step so boxes never overlap and numbers stay readable
const MIN_STEP = BOX_W + 4;
const LAYOUT_KEY = "radio-ctrl-layout";

type LayoutMode = "even" | "scaled" | "fill";

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
  const [classWidth, setClassWidth] = useState(150);
  const [layoutMode, setLayoutMode] = useState<LayoutMode>("even");
  const classWidthRef = useRef(classWidth);
  classWidthRef.current = classWidth;

  useEffect(() => {
    const w = Number(window.localStorage.getItem(CLASS_KEY));
    if (Number.isFinite(w) && w >= CLASS_MIN) setClassWidth(w);
    const m = window.localStorage.getItem(LAYOUT_KEY);
    if (m === "even" || m === "scaled" || m === "fill") setLayoutMode(m);
  }, []);

  function chooseLayout(m: LayoutMode) {
    setLayoutMode(m);
    window.localStorage.setItem(LAYOUT_KEY, m);
  }

  const startClassResize = useCallback((e: React.MouseEvent) => {
    const startX = e.clientX;
    const startW = classWidthRef.current;
    const onMove = (ev: MouseEvent) => {
      const w = Math.min(500, Math.max(CLASS_MIN, startW + (ev.clientX - startX)));
      setClassWidth(w);
    };
    const onUp = () => {
      window.localStorage.setItem(
        CLASS_KEY,
        String(Math.round(classWidthRef.current)),
      );
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
      document.body.style.userSelect = "";
    };
    document.body.style.userSelect = "none";
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
  }, []);

  const view = useMemo(() => {
    if (!sort) return rows;
    const indexed = rows.map((r, i) => [r, i] as [CourseRow, number]);
    indexed.sort((x, y) => {
      const c = compareValues(getValue(x[0], sort.key), getValue(y[0], sort.key));
      return (sort.dir === "asc" ? c : -c) || x[1] - y[1];
    });
    return indexed.map((p) => p[0]);
  }, [rows, sort]);

  // longest course (by summed legs) for the "scaled" layout denominator
  const maxTotal = useMemo(
    () =>
      rows.reduce(
        (m, r) => Math.max(m, r.legs.reduce((s, l) => s + l.dist, 0)),
        0,
      ) || 1,
    [rows],
  );

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
      type="button"
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

  // the inner control glyph (button for controls, plain chip for start/finish)
  function cellInner(
    code: string,
    kind: "start" | "control" | "finish",
    pct: number,
  ) {
    if (kind !== "control") {
      return (
        <span className="rounded bg-gray-100 px-1.5 py-0.5 text-xs font-medium text-gray-600">
          {code}
        </span>
      );
    }
    const selected = code in selection;
    const count = usage.get(code) ?? 0;
    const rank = heatRank.get(code) ?? 0;
    const style = selected
      ? { backgroundColor: radioColor(code), color: "#fff" }
      : heatmap
        ? {
            backgroundColor: heatColor(rank, maxRank),
            color: heatText(rank, maxRank),
          }
        : undefined;
    return (
      <button
        type="button"
        onClick={() => onToggle(code)}
        style={style}
        title={`Control ${code} — used ${count}× · ${Math.round(pct)}% into course`}
        className={`w-full rounded px-1.5 py-0.5 text-center text-xs font-semibold tabular-nums transition ${
          selected
            ? "shadow-sm ring-1 ring-black/10"
            : "hover:ring-1 hover:ring-gray-300"
        } ${!selected && !heatmap ? "bg-gray-50 text-gray-800" : ""}`}
      >
        {code}
      </button>
    );
  }

  // start + legs of a row with cumulative distance and % into the course
  function rowCells(row: CourseRow) {
    const total = row.legs.reduce((s, l) => s + l.dist, 0) || 1;
    const cells: {
      code: string;
      kind: "start" | "control" | "finish";
      cum: number;
      pct: number;
    }[] = [{ code: row.start, kind: "start", cum: 0, pct: 0 }];
    let cum = 0;
    for (const leg of row.legs) {
      cum += leg.dist;
      cells.push({
        code: leg.code,
        kind: leg.code === FINISH ? "finish" : "control",
        cum,
        pct: (cum / total) * 100,
      });
    }
    return { cells, total };
  }

  // x-position (px) of each cell in a stretched layout, pushed right so boxes
  // keep at least MIN_STEP apart (never overlap → readable, scrolls wider).
  function placedCells(row: CourseRow) {
    const { cells, total } = rowCells(row);
    const denom = layoutMode === "fill" ? total : maxTotal;
    let prev = -Infinity;
    const placed = cells.map((c) => {
      let x = (c.cum / denom) * TRACK_W;
      if (x < prev + MIN_STEP) x = prev + MIN_STEP;
      prev = x;
      return { ...c, x };
    });
    return { placed, contentW: prev + BOX_W };
  }

  return (
    <div className="h-full overflow-auto rounded border border-gray-200">
      <div className="min-w-max">
        {/* header */}
        <div className="sticky top-0 z-20 flex items-stretch border-b border-gray-200 bg-gray-50 text-xs font-semibold text-gray-600">
          <div className="sticky left-0 z-10 flex shrink-0 items-stretch gap-2 border-r border-gray-200 bg-gray-50 py-1.5 pl-2">
            <span className="flex w-4 items-center text-gray-300" title="Drag rows to reorder">
              ⠿
            </span>
            <span className="flex items-center truncate" style={{ width: classWidth }}>
              <SortLabel k="class" label="Class" />
            </span>
            <span className={`${LEN_W} flex items-center justify-end text-right`}>
              <SortLabel k="length" label="km" />
            </span>
            <div
              onMouseDown={startClassResize}
              title="Drag to resize class column"
              className="w-1.5 cursor-col-resize self-stretch rounded bg-gray-200 hover:bg-blue-400"
            />
          </div>
          <div className="flex items-center gap-3 px-3 py-1.5">
            <SortLabel k="controls" label="controls →" />
            <div
              className="flex overflow-hidden rounded border border-gray-300 text-[10px] font-medium"
              title="Spacing of controls along each course"
            >
              {(
                [
                  ["even", "Even"],
                  ["scaled", "Scaled"],
                  ["fill", "Fill"],
                ] as [LayoutMode, string][]
              ).map(([m, label]) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => chooseLayout(m)}
                  className={`px-2 py-0.5 ${
                    layoutMode === m
                      ? "bg-blue-600 text-white"
                      : "bg-white text-gray-600 hover:bg-gray-50"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
            {layoutMode !== "even" && (
              <span className="text-[10px] font-normal text-gray-400">
                {layoutMode === "fill"
                  ? "each course fills the width (by leg distance) · close controls may overlap"
                  : "scaled to the longest course · close controls may overlap"}
              </span>
            )}
          </div>
        </div>

        {/* body */}
        {view.map((row, i) => {
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
              <div className="sticky left-0 z-10 flex shrink-0 items-center gap-2 border-r border-gray-200 bg-white py-1 pl-2">
                <span className="w-4 cursor-grab text-gray-300 active:cursor-grabbing">
                  ⠿
                </span>
                <span
                  className="truncate text-xs font-semibold"
                  style={{ width: classWidth }}
                  title={row.classLabel}
                >
                  {row.classLabel}
                </span>
                <span
                  className={`${LEN_W} text-right text-xs tabular-nums text-gray-500`}
                >
                  {row.length}
                </span>
                <span className="w-1.5 shrink-0" />
              </div>

              {layoutMode === "even" ? (
                <div className="flex items-stretch gap-0.5 py-1 pl-2">
                  {rowCells(row).cells.map((c, j) => (
                    <div
                      key={j}
                      className={`flex ${CTRL_W} shrink-0 flex-col items-center justify-start gap-0.5`}
                    >
                      {cellInner(c.code, c.kind, c.pct)}
                    </div>
                  ))}
                </div>
              ) : (
                (() => {
                  const { placed, contentW } = placedCells(row);
                  return (
                    <div className="py-1 pl-2">
                      <div
                        className="relative"
                        style={{
                          width: Math.max(contentW, TRACK_W + BOX_W),
                          height: BOX_H,
                        }}
                      >
                        {layoutMode === "fill" &&
                          [0.25, 0.5, 0.75].map((p) => (
                            <div
                              key={p}
                              className="absolute top-0 bottom-0 border-l border-dashed border-gray-200"
                              style={{ left: BOX_W / 2 + p * TRACK_W }}
                            >
                              <span className="absolute top-0 left-0.5 text-[8px] text-gray-300">
                                {p * 100}%
                              </span>
                            </div>
                          ))}
                        {placed.map((c, idx) => (
                          <div
                            key={idx}
                            className="absolute top-0 flex justify-center"
                            style={{ left: c.x, width: BOX_W }}
                          >
                            {cellInner(c.code, c.kind, c.pct)}
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })()
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
