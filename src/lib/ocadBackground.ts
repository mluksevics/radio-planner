import { Buffer } from "buffer";

export type Bounds = [number, number, number, number]; // [minX, minY, maxX, maxY]

export interface DrawFeature {
  kind: "area" | "line" | "point";
  /** rgb() string */
  color: string;
  /** lower draws first (OCAD colour render order) */
  order: number;
  /** fill/stroke opacity (hatched areas are drawn as a light fill) */
  alpha: number;
  /** area: number[][] ring; line: number[][]; point: [x,y] (projected metres) */
  coords: number[][] | number[];
}

export interface OcadBackground {
  features: DrawFeature[];
  bounds: Bounds;
}

// OCAD object types: 1 = point, 2 = line, 3/4 = area, others (text) are skipped.
const POINT = 1;
const LINE = 2;
const AREA_A = 3;
const AREA_B = 4;

/**
 * Parse an OCAD background map (.ocd) into simplified, projected drawable
 * features for the map canvas — directly from the object/symbol tables (the
 * same reliable readOcad path the course parser uses, no GeoJSON conversion).
 * Coordinates are EPSG-projected metres, matching the control positions, so
 * they align. Bezier control points are treated as plain vertices, which is
 * fine for a backdrop.
 */
export async function parseOcadBackground(file: File): Promise<OcadBackground> {
  const mod = await import("ocad2geojson");
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const m = mod as any;
  const ocad = await m.readOcad(Buffer.from(await file.arrayBuffer()));
  const crs = ocad.getCrs();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const symByNum = new Map<number, any>();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const s of ocad.symbols as any[]) if (s) symByNum.set(s.symNum, s);

  const styleFor = (
    n: number,
  ): { color: string; order: number } => {
    const def = ocad.colors[n];
    return { color: def?.rgb ?? "rgb(160,160,160)", order: def?.renderOrder ?? 0 };
  };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const primaryColor = (s: any): number =>
    (s?.colors || []).find((c: number) => c > 0) ?? s?.color ?? 0;

  const project = (c: number[]): [number, number] =>
    crs.toProjectedCoord([c[0], c[1]]);

  const features: DrawFeature[] = [];
  let minX = Infinity,
    minY = Infinity,
    maxX = -Infinity,
    maxY = -Infinity;
  const grow = (x: number, y: number) => {
    if (x < minX) minX = x;
    if (y < minY) minY = y;
    if (x > maxX) maxX = x;
    if (y > maxY) maxY = y;
  };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const o of ocad.objects as any[]) {
    if (!o.coordinates?.length) continue;
    const s = symByNum.get(o.sym);
    const ot = o.objType;
    if (ot === POINT) {
      const st = styleFor(primaryColor(s));
      const [x, y] = project(o.coordinates[0]);
      grow(x, y);
      features.push({ kind: "point", color: st.color, order: st.order, alpha: 1, coords: [x, y] });
    } else if (ot === LINE) {
      const st = styleFor(primaryColor(s));
      const line = o.coordinates.map(project);
      for (const [x, y] of line) grow(x, y);
      features.push({ kind: "line", color: st.color, order: st.order, alpha: 1, coords: line });
    } else if (ot === AREA_A || ot === AREA_B) {
      // Respect OCAD fill settings: solid fill only when fillOn; hatched areas
      // (marsh, undergrowth, …) get a light fill; otherwise no fill (e.g.
      // outline-only water bodies), which avoids flooding the map with colour.
      let colNum: number;
      let alpha: number;
      if (s?.fillOn) {
        colNum = s.fillColor;
        alpha = 1;
      } else if (s && s.hatchMode > 0) {
        colNum = s.hatchColor;
        alpha = 0.4;
      } else {
        continue;
      }
      const st = styleFor(colNum);
      const ring = o.coordinates.map(project);
      for (const [x, y] of ring) grow(x, y);
      features.push({ kind: "area", color: st.color, order: st.order, alpha, coords: ring });
    }
  }

  features.sort((a, b) => a.order - b.order);
  return { features, bounds: [minX, minY, maxX, maxY] };
}
