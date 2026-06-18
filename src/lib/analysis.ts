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
}

export interface OverviewRow {
  className: string;
  course: string;
  length: number;
  /** keyed by control code; missing => course does not pass that control */
  cells: Record<string, OverviewCell>;
}

/** Matrix of class x selected-control cumulative distance/ratio. Columns = selected controls in order. */
export function buildOverview(
  rows: CourseRow[],
  controls: string[],
): OverviewRow[] {
  return expandClasses(rows).map((entry) => {
    const cells: Record<string, OverviewCell> = {};
    for (const control of controls) {
      const dist = cumulativeDistance(entry.row, control);
      if (dist != null) {
        cells[control] = {
          dist,
          ratio: entry.length > 0 ? dist / entry.length : 0,
        };
      }
    }
    return {
      className: entry.className,
      course: entry.course,
      length: entry.length,
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

/** Generate liveresultat splitcontrols INSERT statements for each class x selected control it passes. */
export function buildSql(
  rows: CourseRow[],
  selection: RadioControl[],
  eventId: string,
): SqlRow[] {
  const out: SqlRow[] = [];
  const eventVal = eventId.trim() === "" ? "NULL" : eventId.trim();
  for (const entry of expandClasses(rows)) {
    for (const rc of selection) {
      const dist = cumulativeDistance(entry.row, rc.control);
      if (dist == null) continue;
      const km = dist.toFixed(1);
      const fullName = rc.name.trim()
        ? `${rc.name.trim()} (${km}km)`
        : `${rc.control} (${km}km)`;
      const codeVal = rc.code.trim() === "" ? rc.control : rc.code.trim();
      const statement =
        "INSERT INTO `liveresultat`.`splitcontrols` " +
        "(`tavid`, `classname`, `code`, `corder`, `name`) VALUES (" +
        `${eventVal}, '${sqlEscape(entry.className)}', ${codeVal}, ${rc.corder}, '${sqlEscape(fullName)}');`;
      out.push({
        className: entry.className,
        control: rc.control,
        code: codeVal,
        corder: rc.corder,
        dist,
        name: fullName,
        statement,
      });
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
