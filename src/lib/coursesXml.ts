import proj4 from "proj4";
import { CourseRow, Leg, Coord } from "./types";

// EPSG:3059 — LKS92 / Latvia TM. Matches the OCAD files' georeferencing, so
// controls projected from the XML's WGS84 lng/lat line up with the OCAD
// background and with OCAD-imported coordinates.
const EPSG3059 =
  "+proj=tmerc +lat_0=0 +lon_0=24 +k=0.9996 +x_0=500000 +y_0=-6000000 +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs";

export interface XmlCourseImport {
  rows: CourseRow[];
  coords: Record<string, Coord>;
}

const round3 = (n: number): number => Math.round(n * 1000) / 1000;

/**
 * Parse an IOF XML v3 CourseData file (e.g. OCAD's "...Courses.xml" export).
 * Produces the same CourseRow[] as the other importers plus a control-code ->
 * position map. Leg lengths come straight from the file (exact), and control
 * positions are the true WGS84 coordinates projected to EPSG:3059.
 */
export async function parseCoursesXml(file: File): Promise<XmlCourseImport> {
  const doc = new DOMParser().parseFromString(
    await file.text(),
    "application/xml",
  );
  if (doc.getElementsByTagName("parsererror").length) {
    throw new Error("Invalid XML file");
  }
  const tags = (el: Element | Document, name: string): Element[] =>
    Array.from(el.getElementsByTagNameNS("*", name));
  const childText = (el: Element, name: string): string => {
    const c = el.getElementsByTagNameNS("*", name)[0];
    return c ? (c.textContent ?? "").trim() : "";
  };

  // control positions (Start/Control/Finish) -> projected metres
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

  // class -> course assignments (ClassName may list several classes)
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
    const lengthM = Number(childText(course, "Length"));
    const length = Number.isFinite(lengthM) && lengthM > 0
      ? round3(lengthM / 1000)
      : round3(legs.reduce((s, l) => s + l.dist, 0));
    const classLabel =
      (courseToClasses.get(name) ?? []).join(" ").trim() || name;
    rows.push({
      classes: classLabel.split(/\s+/).filter(Boolean),
      classLabel,
      course: name,
      length,
      climb: Number(childText(course, "Climb")) || 0,
      start,
      legs,
    });
  }

  return { rows, coords };
}
