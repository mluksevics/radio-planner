"use client";

import { useMemo } from "react";
import { CourseRow } from "@/lib/types";
import { buildOverview } from "@/lib/analysis";

interface Props {
  rows: CourseRow[];
  controls: string[];
}

export default function OverviewTable({ rows, controls }: Props) {
  const overview = useMemo(
    () => buildOverview(rows, controls),
    [rows, controls],
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
    <div className="overflow-x-auto rounded border border-gray-200">
      <table className="min-w-max text-xs">
        <thead className="sticky top-0 bg-gray-50">
          <tr className="border-b border-gray-200">
            <th className="px-2 py-1.5 text-left font-semibold">Class</th>
            <th className="px-2 py-1.5 text-left font-semibold">Course</th>
            <th className="px-2 py-1.5 text-right font-semibold">Length</th>
            {controls.map((c) => (
              <th
                key={c}
                colSpan={2}
                className="border-l border-gray-200 px-2 py-1.5 text-center font-semibold"
              >
                {c} radio
              </th>
            ))}
          </tr>
          <tr className="border-b border-gray-200 text-[10px] text-gray-500">
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
          {overview.map((r, i) => (
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
