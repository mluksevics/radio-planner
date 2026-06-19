import { Buffer } from "buffer";

export type Bounds = [number, number, number, number]; // [minX, minY, maxX, maxY]

export interface DrawFeature {
  kind: "area" | "line" | "point";
  /** rgb() string */
  color: string;
  /** lower draws first (OCAD colour render order) */
  order: number;
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

  // symbol number -> { rgb, renderOrder } using the symbol's primary colour
  const symStyle = new Map<number, { color: string; order: number }>();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const s of ocad.symbols as any[]) {
    if (!s) continue;
    const colNum: number =
      (s.colors || []).find((c: number) => c > 0) ?? s.color ?? 0;
    const def = ocad.colors[colNum];
    symStyle.set(s.symNum, {
      color: def?.rgb ?? "rgb(160,160,160)",
      order: def?.renderOrder ?? 0,
    });
  }

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
    const style = symStyle.get(o.sym) ?? {
      color: "rgb(160,160,160)",
      order: 0,
    };
    const ot = o.objType;
    if (ot === POINT) {
      const [x, y] = project(o.coordinates[0]);
      grow(x, y);
      features.push({ kind: "point", color: style.color, order: style.order, coords: [x, y] });
    } else if (ot === LINE) {
      const line = o.coordinates.map(project);
      for (const [x, y] of line) grow(x, y);
      features.push({ kind: "line", color: style.color, order: style.order, coords: line });
    } else if (ot === AREA_A || ot === AREA_B) {
      const ring = o.coordinates.map(project);
      for (const [x, y] of ring) grow(x, y);
      features.push({ kind: "area", color: style.color, order: style.order, coords: ring });
    }
  }

  features.sort((a, b) => a.order - b.order);
  return { features, bounds: [minX, minY, maxX, maxY] };
}
