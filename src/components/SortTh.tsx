"use client";

import { SortDir } from "@/lib/sorting";

interface Props {
  label: string;
  sortKey: string;
  activeKey?: string;
  dir: SortDir;
  onToggle: (key: string) => void;
  className?: string;
  colSpan?: number;
  color?: string;
}

export default function SortTh({
  label,
  sortKey,
  activeKey,
  dir,
  onToggle,
  className,
  colSpan,
  color,
}: Props) {
  const active = activeKey === sortKey;
  return (
    <th
      colSpan={colSpan}
      onClick={() => onToggle(sortKey)}
      className={`cursor-pointer select-none whitespace-nowrap ${className ?? ""}`}
      title="Click to sort"
      style={color ? { color } : undefined}
    >
      <span className="inline-flex items-center gap-0.5">
        {label}
        <span className={`text-[9px] ${active ? "text-gray-700" : "text-gray-300"}`}>
          {active ? (dir === "asc" ? "▲" : "▼") : "↕"}
        </span>
      </span>
    </th>
  );
}
