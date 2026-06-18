"use client";

import { useCallback, useMemo, useState } from "react";
import { CourseRow } from "@/lib/types";
import { buildOverview, OverviewRow } from "@/lib/analysis";
import { useTableSort } from "@/lib/sorting";
import { radioColor } from "@/lib/heatmap";
import SortTh from "./SortTh";

interface Props {
  rows: CourseRow[];
  controls: string[];
}

function move<T>(arr: T[], from: number, to: number): T[] {
  const copy = [...arr];
  const [item] = copy.splice(from, 1);
  copy.splice(to, 0, item);
  return copy;
}

export default function OverviewTable({ rows, controls }: Props) {
  // manual column order; reconciled with the current selection each render
  const [order, setOrder] = useState<string[]>(controls);
  const [dragCol, setDragCol] = useState<number | null>(null);
  const [overCol, setOverCol] = useState<number | null>(null);

  const ordered = useMemo(() => {
    const set = new Set(controls);
    const kept = order.filter((c) => set.has(c));
    const added = controls.filter((c) => !kept.includes(c));
    return [...kept, ...added];
  }, [order, controls]);

  const overview = useMemo(
    () => buildOverview(rows, ordered),
    [rows, ordered],
  );

  const getValue = useCallback(
    (r: OverviewRow, key: string): number | string | null => {
      if (key === "class") return r.className;
      if (key === "course") return r.course;
      if (key === "length") return r.length;
      if (key.startsWith("c:")) {
        const cell = r.cells[key.slice(2)];
        return cell ? cell.ratio : null;
      }
      return "";
    },
    [],
  );

  const { sorted, sortKey, sortDir, toggle } = useTableSort(
    overview,
    getValue,
    "length",
    "desc",
  );

  function dropCol(target: number) {
    if (dragCol !== null && dragCol !== target) {
      setOrder(move(ordered, dragCol, target));
    }
    setDragCol(null);
    setOverCol(null);
  }

  if (controls.length === 0) {
    return (
      <p className="p-4 text-sm text-gray-500">
        No radio controls selected yet. Select controls in the Export tab to see
        how they fit each class.
      </p>
    );
  }

  return (
    <div className="h-full overflow-auto rounded border border-gray-200">
      <table className="min-w-max text-xs">
        <thead className="sticky top-0 z-10 bg-gray-50 text-gray-600">
          <tr className="border-b border-gray-200">
            <SortTh label="Class" sortKey="class" activeKey={sortKey} dir={sortDir} onToggle={toggle} className="px-2 py-1.5 text-left" />
            <SortTh label="Course" sortKey="course" activeKey={sortKey} dir={sortDir} onToggle={toggle} className="px-2 py-1.5 text-left" />
            <SortTh label="km" sortKey="length" activeKey={sortKey} dir={sortDir} onToggle={toggle} className="px-2 py-1.5 text-right" />
            {ordered.map((c, idx) => (
              <th
                key={c}
                colSpan={2}
                draggable
                onDragStart={() => setDragCol(idx)}
                onDragOver={(e) => {
                  e.preventDefault();
                  if (overCol !== idx) setOverCol(idx);
                }}
                onDrop={() => dropCol(idx)}
                onDragEnd={() => {
                  setDragCol(null);
                  setOverCol(null);
                }}
                style={{ color: radioColor(c) }}
                className={`cursor-move whitespace-nowrap border-l px-2 py-1.5 text-center ${
                  overCol === idx && dragCol !== null && dragCol !== idx
                    ? "border-l-2 border-l-blue-500"
                    : "border-gray-200"
                } ${dragCol === idx ? "opacity-40" : ""}`}
                title="Drag to reorder column"
              >
                <button
                  onClick={() => toggle(`c:${c}`)}
                  className="inline-flex items-center gap-0.5"
                  title="Click to sort"
                >
                  <span className="text-[10px] text-gray-300">⠿</span>
                  {c} radio
                  <span className="text-[9px] text-gray-400">
                    {sortKey === `c:${c}` ? (sortDir === "asc" ? "▲" : "▼") : "↕"}
                  </span>
                </button>
              </th>
            ))}
          </tr>
          <tr className="border-b border-gray-200 text-[10px] text-gray-400">
            <th></th>
            <th></th>
            <th></th>
            {ordered.map((c) => (
              <th key={c} colSpan={2} className="border-l border-gray-200 px-2 pb-1">
                <span className="mr-3">km</span>
                <span>ratio</span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sorted.map((r, i) => (
            <tr key={i} className="border-b border-gray-100 hover:bg-gray-50">
              <td className="px-2 py-1 font-medium">{r.className}</td>
              <td className="px-2 py-1 text-gray-500">{r.course}</td>
              <td className="px-2 py-1 text-right tabular-nums text-gray-500">
                {r.length}
              </td>
              {ordered.map((c) => {
                const cell = r.cells[c];
                return (
                  <td
                    key={c}
                    colSpan={2}
                    className={`border-l border-gray-200 px-2 py-1 text-center tabular-nums ${
                      cell ? "" : "bg-gray-50 text-gray-300"
                    }`}
                  >
                    {cell ? (
                      <>
                        <span className="mr-3 font-medium">
                          {cell.dist.toFixed(2)}
                        </span>
                        <span className="text-gray-500">
                          {(cell.ratio * 100).toFixed(0)}%
                        </span>
                      </>
                    ) : (
                      "—"
                    )}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
