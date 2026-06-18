import { CourseRow, Leg } from "./types";

/**
 * Parse course lines in the format:
 *   classes ; course ; 0 ; length ; climb ; START ; legDist ; control ; ... ; legDist ; F1
 * Mirrors step1.ipynb: control/leg pairs start at index 6, code is at i+1.
 */
export function parseCourses(text: string): CourseRow[] {
  const rows: CourseRow[] = [];
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) continue;
    const f = line.split(";").map((s) => s.trim());
    if (f.length < 7) continue;

    const classLabel = f[0];
    const classes = classLabel.split(/\s+/).filter(Boolean);
    const course = f[1];
    const length = toNum(f[3]);
    const climb = toNum(f[4]);
    const start = f[5];

    const legs: Leg[] = [];
    for (let i = 6; i + 1 < f.length; i += 2) {
      const dist = toNum(f[i]);
      const code = f[i + 1];
      if (!code) continue;
      legs.push({ dist, code });
    }

    rows.push({ classes, classLabel, course, length, climb, start, legs });
  }
  return rows;
}

function toNum(s: string | undefined): number {
  const n = parseFloat((s ?? "").replace(",", "."));
  return Number.isFinite(n) ? n : 0;
}
