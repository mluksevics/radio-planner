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
  onToggleHeatmap: () => void;
  hZoom: number;
  onHZoom: (hZoom: number) => void;
  onToggle: (control: string) => void;
  onReorder: (rows: CourseRow[]) => void;
}

const LEN_W = "w-14";
const CLASS_MIN = 50;
const CLASS_KEY = "radio-class-width";

// stretched-layout geometry (px)
const BOX_H = 24;
const LAYOUT_KEY = "radio-ctrl-layout";

type LayoutMode = "even" | "scaled" | "fill";

interface Cell {
  code: string;
  kind: "start" | "control" | "finish";
  cum: number;
  pct: number;
  /** 1-based position among the course's controls (0 for start/finish) */
  idx: number;
}

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
  onToggleHeatmap,
  hZoom,
  onHZoom,
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

  // available track width, measured ONCE when data first appears. This is the
  // initial Fill width (hZoom = 1 ⇒ fills the visible table); the slider then
  // stretches from here. Not re-measured on window resize, on purpose.
  const scrollRef = useRef<HTMLDivElement>(null);
  const headRef = useRef<HTMLDivElement>(null);
  const measuredRef = useRef(false);
  const [availW, setAvailW] = useState(900);
  useEffect(() => {
    if (measuredRef.current || rows.length === 0) return;
    const el = scrollRef.current;
    const head = headRef.current;
    if (!el || !head) return;
    setAvailW(Math.max(240, el.clientWidth - head.offsetWidth - 16));
    measuredRef.current = true;
  }, [rows.length]);

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

  // longest course (summed legs) → reference for the "scaled" layout
  const maxTotal = useMemo(
    () =>
      rows.reduce(
        (m, r) => Math.max(m, r.legs.reduce((s, l) => s + l.dist, 0)),
        0,
      ) || 1,
    [rows],
  );

  // box width = just enough to show the widest control code (e.g. "180"), tight
  const boxW = useMemo(() => {
    let len = 2;
    for (const r of rows) {
      if (r.start.length > len) len = r.start.length;
      for (const l of r.legs) if (l.code.length > len) len = l.code.length;
    }
    return Math.round(len * 7 + 10);
  }, [rows]);

  // slider ↔ zoom: log scale, slider centre (pos 50) = zoom 1 = fills the
  // available table width (same reference for Scaled and Fill).
  const posToZoom = (p: number) => Math.pow(4, (p - 50) / 50);
  const zoomToPos = (z: number) =>
    Math.max(0, Math.min(100, Math.round(50 + (50 * Math.log(z)) / Math.log(4))));

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

  // the inner control glyph (button for controls, plain chip for start/finish).
  // `wide`: stretched layouts where the box fills the gap → left-align the number
  // at the control's actual position.
  function cellInner(c: Cell, nControls: number, wide = false) {
    const { code, kind, cum, pct, idx } = c;
    if (kind !== "control") {
      return (
        <span
          className={`rounded bg-gray-100 px-1 py-0.5 text-xs font-medium text-gray-600 ${
            wide ? "block w-full text-left" : ""
          }`}
        >
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
    // native title renders "\n" as line breaks
    const title = [
      `Control ${code}`,
      `control ${idx} of ${nControls} on this course`,
      `${cum.toFixed(2)} km · ${Math.round(pct)}% into course`,
      `used in ${count} course${count === 1 ? "" : "s"}`,
    ].join("\n");
    return (
      <button
        type="button"
        onClick={() => onToggle(code)}
        style={style}
        title={title}
        className={`w-full rounded px-1 py-0.5 text-xs font-semibold tabular-nums transition ${
          wide ? "text-left" : "text-center"
        } ${
          selected
            ? "shadow-sm ring-1 ring-black/10"
            : "hover:ring-1 hover:ring-gray-300"
        } ${!selected && !heatmap ? "bg-gray-50 text-gray-800" : ""}`}
      >
        {code}
      </button>
    );
  }

  // start + legs of a row with cumulative distance, % and control index
  function rowCells(row: CourseRow): {
    cells: Cell[];
    total: number;
    nControls: number;
  } {
    const total = row.legs.reduce((s, l) => s + l.dist, 0) || 1;
    const nControls = row.legs.filter((l) => l.code !== FINISH).length;
    const cells: Cell[] = [
      { code: row.start, kind: "start", cum: 0, pct: 0, idx: 0 },
    ];
    let cum = 0;
    let idx = 0;
    for (const leg of row.legs) {
      cum += leg.dist;
      const isFinish = leg.code === FINISH;
      if (!isFinish) idx += 1;
      cells.push({
        code: leg.code,
        kind: isFinish ? "finish" : "control",
        cum,
        pct: (cum / total) * 100,
        idx: isFinish ? 0 : idx,
      });
    }
    return { cells, total, nControls };
  }

  // x of each cell in a stretched layout. Both modes guarantee no overlap
  // (shortest leg ≥ one box width).
  // "fill": every course shares ONE width (so the 25/50/75% marks line up),
  //   wide enough for the densest course; controls sit at fraction of THIS
  //   course → a control at 50% of any course is on the same vertical line.
  // "scaled": one shared px/km (global shortest leg) so leg distances are
  //   directly comparable across courses (rows differ in width).
  function placedCells(row: CourseRow) {
    const { cells, total, nControls } = rowCells(row);
    let xs: number[];
    let contentW: number;
    let gridCenter: (p: number) => number;
    if (layoutMode === "fill") {
      // hZoom 1 ⇒ every course fills the available table width
      const usable = Math.max(boxW, (availW - boxW) * hZoom);
      xs = cells.map((c) => (c.cum / total) * usable);
      contentW = usable + boxW;
      gridCenter = (p) => p * usable + boxW / 2;
    } else {
      // hZoom 1 ⇒ the LONGEST course fills the available width; shorter courses
      // end proportionally earlier (rows differ in width).
      const scale = ((availW - boxW) / maxTotal) * hZoom; // px per km
      xs = cells.map((c) => c.cum * scale);
      contentW = (xs.length ? xs[xs.length - 1] : 0) + boxW;
      gridCenter = (p) => p * total * scale + boxW / 2;
    }
    // each box fills the gap up to the next control (so the row fills the
    // width); the last (finish) keeps a single box width.
    const placed = cells.map((c, i) => ({
      ...c,
      x: xs[i],
      w: i < xs.length - 1 ? Math.max(boxW, xs[i + 1] - xs[i]) : boxW,
    }));
    return { placed, contentW, gridCenter, nControls };
  }

  return (
    <div
      ref={scrollRef}
      className="h-full overflow-auto rounded border border-gray-200"
    >
      <div className="min-w-max">
        {/* header */}
        <div className="sticky top-0 z-20 flex items-stretch border-b border-gray-200 bg-gray-50 text-xs font-semibold text-gray-600">
          <div
            ref={headRef}
            className="sticky left-0 z-10 flex shrink-0 items-stretch gap-2 border-r border-gray-200 bg-gray-50 py-1.5 pl-2"
          >
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
            <label className="flex cursor-pointer items-center gap-1 text-[11px] font-normal text-gray-600">
              <input
                type="checkbox"
                checked={heatmap}
                onChange={onToggleHeatmap}
                className="accent-orange-500"
              />
              Heatmap
            </label>
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
              <>
                <label
                  className="flex items-center gap-1 text-[10px] font-normal text-gray-400"
                  title="Compact or stretch horizontally — centre fits the table width"
                >
                  compact
                  <input
                    type="range"
                    min={0}
                    max={100}
                    value={zoomToPos(hZoom)}
                    onChange={(e) => onHZoom(posToZoom(Number(e.target.value)))}
                    className="w-32"
                  />
                  wide
                </label>
                <span className="text-[10px] font-normal text-gray-400">
                  {layoutMode === "fill"
                    ? "every course fills the width · 25/50/75% marks align"
                    : "scaled to the longest course"}
                </span>
              </>
            )}
          </div>
        </div>

        {/* body */}
        {view.map((row, i) => {
          const nControls = row.legs.filter((l) => l.code !== FINISH).length;
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
                  title={`${row.classLabel}\n${row.course} · ${nControls} controls`}
                >
                  {row.classLabel}
                </span>
                <span
                  className={`${LEN_W} text-right text-xs tabular-nums text-gray-500`}
                >
                  {row.length.toFixed(2)}
                </span>
                <span className="w-1.5 shrink-0" />
              </div>

              {layoutMode === "even" ? (
                <div className="flex items-stretch gap-0.5 py-1 pl-2">
                  {rowCells(row).cells.map((c, idx) => (
                    <div
                      key={idx}
                      style={{ width: boxW }}
                      className="flex shrink-0 flex-col items-center justify-start"
                    >
                      {cellInner(c, nControls)}
                    </div>
                  ))}
                </div>
              ) : (
                (() => {
                  const { placed, contentW, gridCenter } = placedCells(row);
                  return (
                    <div className="py-1 pl-2">
                      <div
                        data-testid="ctrl-track"
                        className="relative"
                        style={{ width: contentW, height: BOX_H }}
                      >
                        {layoutMode === "fill" &&
                          [0.25, 0.5, 0.75].map((p) => (
                            <div
                              key={p}
                              className="absolute top-0 bottom-0 border-l border-dashed border-gray-200"
                              style={{ left: gridCenter(p) }}
                            >
                              <span className="absolute top-0 left-0.5 text-[8px] text-gray-300">
                                {p * 100}%
                              </span>
                            </div>
                          ))}
                        {placed.map((c, idx) => (
                          <div
                            key={idx}
                            className="absolute top-0 flex justify-start"
                            style={{ left: c.x, width: c.w }}
                          >
                            {cellInner(c, nControls, true)}
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
