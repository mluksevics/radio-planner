import proj4 from "proj4";
import { CourseRow, Leg, Coord } from "./types";

// EPSG:3059 — LKS92 / Latvia TM. Matches the OCAD files' georeferencing, so
// controls projected from the v3 XML's WGS84 lng/lat line up with the OCAD
// background and OCAD-imported coordinates. The v2 XML already stores grid
// coordinates in this system, so they are used as-is.
const EPSG3059 =
  "+proj=tmerc +lat_0=0 +lon_0=24 +k=0.9996 +x_0=500000 +y_0=-6000000 +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs";

export interface XmlCourseImport {
  rows: CourseRow[];
  coords: Record<string, Coord>;
}

const round3 = (n: number): number => Math.round(n * 1000) / 1000;

const tags = (el: Element | Document, name: string): Element[] =>
  Array.from(el.getElementsByTagNameNS("*", name));

const childText = (el: Element, name: string): string => {
  const c = el.getElementsByTagNameNS("*", name)[0];
  return c ? (c.textContent ?? "").trim() : "";
};

/**
 * Parse an IOF XML CourseData file (OCAD's "...Courses.xml" export), supporting
 * both v3.0 and v2.0.3. Produces the same CourseRow[] as the other importers
 * plus a control-code -> position map. Leg lengths come straight from the file,
 * and control positions are projected to / kept in EPSG:3059 so they align with
 * the OCAD background.
 */
export async function parseCoursesXml(file: File): Promise<XmlCourseImport> {
  const doc = new DOMParser().parseFromString(
    await file.text(),
    "application/xml",
  );
  if (doc.getElementsByTagName("parsererror").length) {
    throw new Error("Invalid XML file");
  }
  const version =
    tags(doc, "IOFVersion")[0]?.getAttribute("version") ??
    doc.documentElement.getAttribute("iofVersion") ??
    "3";
  return version.startsWith("2") ? parseV2(doc) : parseV3(doc);
}

/** IOF v3.0: <Control> with <Id> and WGS84 <Position lng lat>; <Course> blocks. */
function parseV3(doc: Document): XmlCourseImport {
  const coords: Record<string, Coord> = {};
  for (const ctrl of tags(doc, "Control")) {
    const id = childText(ctrl, "Id");
    const pos = ctrl.getElementsByTagNameNS("*", "Position")[0];
    if (!id || !pos) continue; // skips the <Control> leaves inside CourseControl
    const lng = Number(pos.getAttribute("lng"));
    const lat = Number(pos.getAttribute("lat"));
    if (!Number.isFinite(lng) || !Number.isFinite(lat)) continue;
    const [x, y] = proj4(EPSG3059, [lng, lat]) as [number, number];
    coords[id] = { x, y };
  }

  const courseToClasses = new Map<string, string[]>();
  for (const a of tags(doc, "ClassCourseAssignment")) {
    const cls = childText(a, "ClassName");
    const crs = childText(a, "CourseName");
    if (!cls || !crs) continue;
    (courseToClasses.get(crs) ?? courseToClasses.set(crs, []).get(crs)!).push(cls);
  }

  const rows: CourseRow[] = [];
  for (const course of tags(doc, "Course")) {
    const name = childText(course, "Name");
    let start = "S1";
    const legs: Leg[] = [];
    for (const cc of tags(course, "CourseControl")) {
      const type = cc.getAttribute("type");
      const code = childText(cc, "Control");
      if (type === "Start") {
        start = code || "S1";
        continue;
      }
      const legLen = Number(childText(cc, "LegLength"));
      legs.push({
        dist: Number.isFinite(legLen) ? round3(legLen / 1000) : 0,
        code: type === "Finish" ? "F1" : code,
      });
    }
    const classNames = courseToClasses.get(name) ?? [];
    const classLabel = classNames.join(" ").trim() || name;
    rows.push(
      buildRow(
        name,
        classLabel,
        start,
        legs,
        Number(childText(course, "Length")),
        Number(childText(course, "Climb")),
        classNames.length ? classNames : [name],
      ),
    );
  }
  return { rows, coords };
}

/**
 * IOF v2.0.3: <StartPoint>/<Control>/<FinishPoint> with grid <ControlPosition>;
 * <Course> with <ClassShortName> and one or more <CourseVariation> blocks.
 */
function parseV2(doc: Document): XmlCourseImport {
  const coords: Record<string, Coord> = {};
  const addPoint = (el: Element, codeTag: string) => {
    const code = childText(el, codeTag);
    const pos = el.getElementsByTagNameNS("*", "ControlPosition")[0];
    if (!code || !pos) return;
    const x = Number(pos.getAttribute("x"));
    const y = Number(pos.getAttribute("y"));
    if (Number.isFinite(x) && Number.isFinite(y)) coords[code] = { x, y };
  };
  for (const sp of tags(doc, "StartPoint")) addPoint(sp, "StartPointCode");
  for (const c of tags(doc, "Control")) addPoint(c, "ControlCode");
  for (const fp of tags(doc, "FinishPoint")) addPoint(fp, "FinishPointCode");

  const rows: CourseRow[] = [];
  for (const course of tags(doc, "Course")) {
    const name = childText(course, "CourseName");
    const classLabel = childText(course, "ClassShortName") || name;
    const variations = tags(course, "CourseVariation");
    for (const v of variations) {
      const start = childText(v, "StartPointCode") || "S1";
      const legs: Leg[] = [];
      for (const cc of tags(v, "CourseControl")) {
        const code = childText(cc, "ControlCode");
        const legLen = Number(childText(cc, "LegLength"));
        legs.push({
          dist: Number.isFinite(legLen) ? round3(legLen / 1000) : 0,
          code,
        });
      }
      // finish leg
      const finishCode = childText(v, "FinishPointCode");
      if (finishCode) {
        const toFin = Number(childText(v, "DistanceToFinish"));
        legs.push({
          dist: Number.isFinite(toFin) ? round3(toFin / 1000) : 0,
          code: "F1",
        });
      }
      const vname =
        variations.length > 1
          ? `${name} (${childText(v, "CourseVariationId") || rows.length})`
          : name;
      rows.push(
        buildRow(
          vname,
          classLabel,
          start,
          legs,
          Number(childText(v, "CourseLength")),
          Number(childText(v, "CourseClimb")),
          [classLabel],
        ),
      );
    }
  }
  return { rows, coords };
}

function buildRow(
  course: string,
  classLabel: string,
  start: string,
  legs: Leg[],
  lengthM: number,
  climb: number,
  classes?: string[],
): CourseRow {
  const length =
    Number.isFinite(lengthM) && lengthM > 0
      ? round3(lengthM / 1000)
      : round3(legs.reduce((s, l) => s + l.dist, 0));
  return {
    // prefer the authoritative class list (XML gives real names that may
    // contain spaces); only fall back to splitting the label by whitespace.
    classes: classes?.length ? classes : classLabel.split(/\s+/).filter(Boolean),
    classLabel,
    course,
    length,
    climb: Number.isFinite(climb) ? climb : 0,
    start,
    legs,
  };
}
