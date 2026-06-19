import { CourseRow, RadioControl } from "./types";

export interface ControlUsage {
  control: string;
  count: number;
  /** class labels of the courses that use this control */
  classes: string[];
}

export const FINISH = "F1";

/** Count how many course rows include each control (excluding the finish), sorted desc. */
export function controlUsage(rows: CourseRow[]): ControlUsage[] {
  const map = new Map<string, { count: number; classes: string[] }>();
  for (const row of rows) {
    const seen = new Set<string>();
    for (const leg of row.legs) {
      if (leg.code === FINISH || seen.has(leg.code)) continue;
      seen.add(leg.code);
      const entry = map.get(leg.code) ?? { count: 0, classes: [] };
      entry.count += 1;
      entry.classes.push(row.classLabel);
      map.set(leg.code, entry);
    }
  }
  return [...map.entries()]
    .map(([control, e]) => ({ control, count: e.count, classes: e.classes }))
    .sort((a, b) => b.count - a.count || numericCompare(a.control, b.control));
}

export function usageCountMap(rows: CourseRow[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const u of controlUsage(rows)) m.set(u.control, u.count);
  return m;
}

/**
 * Dense rank of each control by usage count: the lowest distinct count is rank 1,
 * the next distinct count rank 2, etc. e.g. counts {27,12,11} -> {27:3, 12:2, 11:1}.
 * Used for heatmap shading so colors spread by frequency tier, not raw count.
 */
export function usageRanks(usage: ControlUsage[]): {
  rank: Map<string, number>;
  maxRank: number;
} {
  const distinct = [...new Set(usage.map((u) => u.count))].sort((a, b) => a - b);
  const rankOf = new Map<number, number>();
  distinct.forEach((count, i) => rankOf.set(count, i + 1));
  const rank = new Map<string, number>();
  for (const u of usage) rank.set(u.control, rankOf.get(u.count) ?? 0);
  return { rank, maxRank: distinct.length };
}

export interface LegUsage {
  /** undirected key `${a}|${b}` with a/b deterministically ordered */
  key: string;
  a: string;
  b: string;
  /** number of classes whose course traverses this leg */
  count: number;
}

const isStartCode = (code: string) => /^S\d+/.test(code);

/**
 * Count how often each control-to-control leg is traversed, weighted per class
 * (a course shared by N classes contributes N). Legs are undirected, so 31-32
 * and 32-31 collapse to one entry. Start and finish legs are excluded.
 */
export function legUsage(rows: CourseRow[]): LegUsage[] {
  const map = new Map<string, { a: string; b: string; count: number }>();
  for (const entry of expandClasses(rows)) {
    const seen = new Set<string>();
    let from = entry.row.start;
    for (const leg of entry.row.legs) {
      const to = leg.code;
      const a = from;
      from = to;
      if (isStartCode(a) || a === FINISH || isStartCode(to) || to === FINISH) {
        continue;
      }
      const [lo, hi] = a < to ? [a, to] : [to, a];
      const key = `${lo}|${hi}`;
      if (seen.has(key)) continue; // count a leg once per class
      seen.add(key);
      const e = map.get(key) ?? { a: lo, b: hi, count: 0 };
      e.count += 1;
      map.set(key, e);
    }
  }
  return [...map.entries()]
    .map(([key, e]) => ({ key, ...e }))
    .sort((x, y) => y.count - x.count || numericCompare(x.a, y.a));
}

/** Dense rank of each leg by usage count, keyed by leg key. Mirrors {@link usageRanks}. */
export function legUsageRanks(usage: LegUsage[]): {
  rank: Map<string, number>;
  maxRank: number;
} {
  const distinct = [...new Set(usage.map((u) => u.count))].sort((a, b) => a - b);
  const rankOf = new Map<number, number>();
  distinct.forEach((count, i) => rankOf.set(count, i + 1));
  const rank = new Map<string, number>();
  for (const u of usage) rank.set(u.key, rankOf.get(u.count) ?? 0);
  return { rank, maxRank: distinct.length };
}

/** Cumulative distance (km) from start to the first occurrence of `control`, or null if absent. */
export function cumulativeDistance(row: CourseRow, control: string): number | null {
  let total = 0;
  for (const leg of row.legs) {
    total += leg.dist;
    if (leg.code === control) return total;
  }
  return null;
}

export interface ClassEntry {
  className: string;
  course: string;
  length: number;
  row: CourseRow;
}

/** Expand course rows into one entry per class (a class belongs to exactly one course). */
export function expandClasses(rows: CourseRow[]): ClassEntry[] {
  const out: ClassEntry[] = [];
  for (const row of rows) {
    for (const className of row.classes) {
      out.push({ className, course: row.course, length: row.length, row });
    }
  }
  return out;
}

export interface OverviewCell {
  dist: number;
  ratio: number;
  /** 1-based position of the control among the course's controls */
  idx: number;
}

export interface OverviewRow {
  className: string;
  course: string;
  length: number;
  /** number of controls in the course (excludes start/finish) */
  nControls: number;
  /** keyed by control code; missing => course does not pass that control */
  cells: Record<string, OverviewCell>;
}

/** Matrix of class x selected-control cumulative distance/ratio. Columns = selected controls in order. */
export function buildOverview(
  rows: CourseRow[],
  controls: string[],
): OverviewRow[] {
  return expandClasses(rows).map((entry) => {
    // 1-based control index of the first occurrence of each control
    const firstIdx = new Map<string, number>();
    let n = 0;
    for (const leg of entry.row.legs) {
      if (leg.code === FINISH) continue;
      n += 1;
      if (!firstIdx.has(leg.code)) firstIdx.set(leg.code, n);
    }
    const cells: Record<string, OverviewCell> = {};
    for (const control of controls) {
      const dist = cumulativeDistance(entry.row, control);
      if (dist != null) {
        cells[control] = {
          dist,
          ratio: entry.length > 0 ? dist / entry.length : 0,
          idx: firstIdx.get(control) ?? 0,
        };
      }
    }
    return {
      className: entry.className,
      course: entry.course,
      length: entry.length,
      nControls: n,
      cells,
    };
  });
}

export interface SqlRow {
  className: string;
  control: string;
  code: string;
  corder: number;
  dist: number;
  name: string;
  statement: string;
}

function sqlEscape(s: string): string {
  return s.replace(/'/g, "''");
}

/**
 * Generate liveresultat splitcontrols INSERT statements: one row per passing of
 * a selected control within each class, walking the course in order.
 *  - code   = 1000 * passingNumber + controlNumber (1st pass of 53 → 1053, 2nd → 2053)
 *  - corder = order of the split within the class (0, 1, 2 … in course order)
 */
export function buildSql(
  rows: CourseRow[],
  selection: RadioControl[],
  eventId: string,
): SqlRow[] {
  const out: SqlRow[] = [];
  const eventVal = eventId.trim() === "" ? "NULL" : eventId.trim();
  const byControl = new Map(selection.map((rc) => [rc.control, rc]));
  for (const entry of expandClasses(rows)) {
    const passCount = new Map<string, number>();
    let corder = 0;
    let cum = 0;
    for (const leg of entry.row.legs) {
      cum += leg.dist;
      const rc = byControl.get(leg.code);
      if (!rc) {
        continue;
      }
      const pass = (passCount.get(leg.code) ?? 0) + 1;
      passCount.set(leg.code, pass);
      const controlNum = Number(leg.code);
      const codeVal = Number.isFinite(controlNum)
        ? String(1000 * pass + controlNum)
        : leg.code;
      const km = cum.toFixed(1);
      const fullName = rc.name.trim()
        ? `${rc.name.trim()} (${km}km)`
        : `${rc.control} (${km}km)`;
      const statement =
        "INSERT INTO `liveresultat`.`splitcontrols` " +
        "(`tavid`, `classname`, `code`, `corder`, `name`) VALUES (" +
        `${eventVal}, '${sqlEscape(entry.className)}', ${codeVal}, ${corder}, '${sqlEscape(fullName)}');`;
      out.push({
        className: entry.className,
        control: rc.control,
        code: codeVal,
        corder,
        dist: cum,
        name: fullName,
        statement,
      });
      corder += 1;
    }
  }
  return out;
}

function numericCompare(a: string, b: string): number {
  const na = Number(a);
  const nb = Number(b);
  if (Number.isFinite(na) && Number.isFinite(nb)) return na - nb;
  return a.localeCompare(b);
}
