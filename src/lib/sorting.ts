import { useCallback, useMemo, useState } from "react";

export type SortDir = "asc" | "desc";

/** Compare two values; empty/null/undefined always sort last. Numbers numeric, strings natural. */
export function compareValues(
  a: number | string | null | undefined,
  b: number | string | null | undefined,
): number {
  const aEmpty = a === null || a === undefined || a === "";
  const bEmpty = b === null || b === undefined || b === "";
  if (aEmpty && bEmpty) return 0;
  if (aEmpty) return 1;
  if (bEmpty) return -1;
  if (typeof a === "number" && typeof b === "number") return a - b;
  return String(a).localeCompare(String(b), undefined, { numeric: true });
}

/** Stable sort hook. `getValue(row, key)` returns the sortable value for a column key. */
export function useTableSort<T>(
  rows: T[],
  getValue: (row: T, key: string) => number | string | null | undefined,
  initialKey?: string,
  initialDir: SortDir = "asc",
) {
  const [sortKey, setSortKey] = useState<string | undefined>(initialKey);
  const [sortDir, setSortDir] = useState<SortDir>(initialDir);

  const sorted = useMemo(() => {
    if (!sortKey) return rows;
    const indexed = rows.map((r, i) => [r, i] as [T, number]);
    indexed.sort((x, y) => {
      const c = compareValues(getValue(x[0], sortKey), getValue(y[0], sortKey));
      return (sortDir === "asc" ? c : -c) || x[1] - y[1];
    });
    return indexed.map((p) => p[0]);
    // getValue is expected to be cheap/pure; data sets here are small.
  }, [rows, sortKey, sortDir, getValue]);

  const toggle = useCallback((key: string) => {
    setSortKey((prev) => {
      if (prev === key) {
        setSortDir((d) => (d === "asc" ? "desc" : "asc"));
        return prev;
      }
      setSortDir("asc");
      return key;
    });
  }, []);

  return { sorted, sortKey, sortDir, toggle };
}
