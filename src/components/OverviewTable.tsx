"use client";

import { useCallback, useMemo } from "react";
import { CourseRow } from "@/lib/types";
import { buildOverview, OverviewRow } from "@/lib/analysis";
import { useTableSort } from "@/lib/sorting";
import { radioColor } from "@/lib/heatmap";
import SortTh from "./SortTh";

interface Props {
  rows: CourseRow[];
  controls: string[];
}

export default function OverviewTable({ rows, controls }: Props) {
  const overview = useMemo(
    () => buildOverview(rows, controls),
    [rows, controls],
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
            {controls.map((c) => (
              <SortTh
                key={c}
                label={`${c} radio`}
                sortKey={`c:${c}`}
                activeKey={sortKey}
                dir={sortDir}
                onToggle={toggle}
                colSpan={2}
                color={radioColor(c)}
                className="border-l border-gray-200 px-2 py-1.5 text-center"
              />
            ))}
          </tr>
          <tr className="border-b border-gray-200 text-[10px] text-gray-400">
            <th></th>
            <th></th>
            <th></th>
            {controls.map((c) => (
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
              {controls.map((c) => {
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
