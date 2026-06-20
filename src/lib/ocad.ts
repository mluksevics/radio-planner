import { Buffer } from "buffer";
import { CourseRow, Leg, Coord } from "./types";

/**
 * OCAD course-setting symbol numbers (verified against ocad_plan.ocd):
 *  - 704001: control marker — its `text` holds the control code, e.g. "100"
 *            or "100 [30]" for a per-course copy; start markers are "S1"/"S2".
 *  - 704000: control sequence-order number (1,2,3…) — ignored.
 *  - 706000: finish marker.
 *  - 701000: start triangle.
 */
const CONTROL_SYM = 704001;
const FINISH_SYM = 706000;

export interface OcadCourseImport {
  rows: CourseRow[];
  /** control code (and "S1"/"F1") -> projected position in metres */
  coords: Record<string, Coord>;
}

/** Strip OCAD's per-course variant suffix: "100 [30]" -> "100". */
const stripVariant = (t: string): string =>
  (t ?? "").replace(/\s*\[\d+\]\s*$/, "").trim();
const hasVariant = (t: string): boolean => /\[\d+\]\s*$/.test(t ?? "");

function average(points: Coord[]): Coord {
  let x = 0;
  let y = 0;
  for (const p of points) {
    x += p.x;
    y += p.y;
  }
  return { x: x / points.length, y: y / points.length };
}

const distanceM = (a: Coord, b: Coord): number =>
  Math.hypot(a.x - b.x, a.y - b.y);

/** First value of a parameter-string field that may be a string or string[]. */
function asString(v: unknown): string {
  if (Array.isArray(v)) return typeof v[0] === "string" ? v[0] : "";
  return typeof v === "string" ? v : "";
}

/**
 * Parse an OCAD course-setting (.ocd) file into the same CourseRow[] the text
 * importer produces, plus a control-code -> position map for the map view.
 * Leg/course distances are straight-line (km), which by definition equals an
 * orienteering course's length.
 */
export async function parseOcadCourse(file: File): Promise<OcadCourseImport> {
  // ocad2geojson is CommonJS and pulls in Node Buffer; load it lazily so it
  // only runs in the browser when a file is actually imported.
  const mod = await import("ocad2geojson");
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const readOcad = (mod as any).readOcad as (b: Buffer) => Promise<any>;

  const buf = Buffer.from(await file.arrayBuffer());
  const ocad = await readOcad(buf);
  const crs = ocad.getCrs();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const objCentroid = (o: any): Coord => {
    let x = 0;
    let y = 0;
    for (const c of o.coordinates) {
      const p = crs.toProjectedCoord([c[0], c[1]]);
      x += p[0];
      y += p[1];
    }
    const n = o.coordinates.length || 1;
    return { x: x / n, y: y / n };
  };

  // 1. control positions from 704001 markers, grouped by code. Prefer the clean
  // "all controls" copy (true surveyed position); the per-course (suffixed)
  // copies are intentionally displaced for drawing clarity, which inflates
  // straight-line distances, so only use them as a fallback.
  const suffixed = new Map<string, Coord[]>();
  const clean = new Map<string, Coord[]>();
  for (const o of ocad.objects) {
    if (o.sym !== CONTROL_SYM) continue;
    const code = stripVariant(o.text);
    if (!code) continue;
    const target = hasVariant(o.text) ? suffixed : clean;
    (target.get(code) ?? target.set(code, []).get(code)!).push(objCentroid(o));
  }
  const coords: Record<string, Coord> = {};
  for (const code of new Set([...clean.keys(), ...suffixed.keys()])) {
    const pts = clean.get(code) ?? suffixed.get(code)!;
    coords[code] = average(pts);
  }
  // finish position(s) from the dedicated finish symbol. A finish marker may
  // carry its code as text ("F1".."F4"); use that when present, otherwise keep
  // the unlabelled positions to fall back on for whatever finish the courses
  // reference (so a course finishing at F2 still gets a position).
  const labelledFinish = new Map<string, Coord[]>();
  const unlabelledFinish: Coord[] = [];
  for (const o of ocad.objects) {
    if (o.sym !== FINISH_SYM) continue;
    const t = stripVariant(o.text);
    if (/^F\d+$/.test(t)) {
      (labelledFinish.get(t) ?? labelledFinish.set(t, []).get(t)!).push(
        objCentroid(o),
      );
    } else {
      unlabelledFinish.push(objCentroid(o));
    }
  }
  for (const [code, pts] of labelledFinish) {
    if (!coords[code]) coords[code] = average(pts);
  }

  // 2. courses (rec type 2) + class->course mapping (rec type 3)
  const courseStrings = ocad.parameterStrings[2] ?? [];
  const classStrings = ocad.parameterStrings[3] ?? [];
  const courseToClasses = new Map<string, string[]>();
  for (const cl of classStrings) {
    const course = asString(cl.c);
    const label = asString(cl._first);
    if (!course || !label) continue;
    (courseToClasses.get(course) ?? courseToClasses.set(course, []).get(course)!).push(label);
  }

  // give any finish a position before measuring legs: prefer a labelled finish
  // marker, else the unlabelled finish symbol(s).
  const fallbackFinish = unlabelledFinish.length
    ? average(unlabelledFinish)
    : undefined;
  for (const c of courseStrings) {
    const finish = asString(c.f) || "F1";
    if (!coords[finish] && fallbackFinish) coords[finish] = fallbackFinish;
  }

  const rows: CourseRow[] = [];
  for (const c of courseStrings) {
    const course = asString(c._first);
    const start = asString(c.s) || "S1";
    const controls = ([] as string[]).concat(c.c ?? []);
    const finish = asString(c.f) || "F1";
    const seq = [start, ...controls, finish];

    const legs: Leg[] = [];
    let length = 0;
    for (let i = 1; i < seq.length; i++) {
      const a = coords[seq[i - 1]];
      const b = coords[seq[i]];
      const km = a && b ? distanceM(a, b) / 1000 : 0;
      length += km;
      legs.push({ dist: round3(km), code: seq[i] });
    }

    const classLabel = (courseToClasses.get(course) ?? []).join(" ").trim() || course;
    const classes = classLabel.split(/\s+/).filter(Boolean);
    rows.push({
      classes,
      classLabel,
      course,
      length: round3(length),
      climb: 0,
      start,
      legs,
    });
  }

  return { rows, coords };
}

const round3 = (n: number): number => Math.round(n * 1000) / 1000;
