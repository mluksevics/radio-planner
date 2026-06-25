import { Buffer } from "buffer";

export type Bounds = [number, number, number, number]; // [minX, minY, maxX, maxY]

export interface DrawFeature {
  kind: "area" | "line" | "point";
  /** rgb() string */
  color: string;
  /** OCAD colour render order (higher draws further back) */
  order: number;
  /** fill/stroke opacity (hatched areas are drawn as a light fill) */
  alpha: number;
  /** stroke width in projected metres (lines only) */
  width?: number;
  /** area: rings (number[][][]); line: number[][]; point: [x,y] (projected metres) */
  coords: number[][][] | number[][] | number[];
}

export interface OcadBackground {
  features: DrawFeature[];
  bounds: Bounds;
}

// OCAD object types (see ocad2geojson): 1 = point, 2 = line, 3 = area; 4-7 are
// text / rectangle and are skipped (note: 4 is text, NOT an area).
const POINT = 1;
const LINE = 2;
const AREA = 3;

// TdPoly stores clean coords at [0]/[1]; bezier/hole flags live in xFlags/yFlags.
interface TdPoly extends Array<number> {
  xFlags: number;
  yFlags: number;
  isFirstBezier(): boolean;
  isSecondBezier(): boolean;
  isFirstHolePoint(): boolean;
}

type XY = [number, number];

const dist = (a: number[], b: number[]): number =>
  Math.hypot(a[0] - b[0], a[1] - b[1]);

// Sample a cubic bezier (excluding the start point); step count scales with the
// control-polygon length so curves stay smooth without exploding point counts.
function sampleCubic(p0: number[], p1: number[], p2: number[], p3: number[]): XY[] {
  const approx = dist(p0, p1) + dist(p1, p2) + dist(p2, p3);
  const steps = Math.max(8, Math.min(32, Math.round(approx / 100)));
  const pts: XY[] = [];
  for (let i = 1; i <= steps; i++) {
    const t = i / steps;
    const u = 1 - t;
    const a = u * u * u;
    const b = 3 * u * u * t;
    const c = 3 * u * t * t;
    const d = t * t * t;
    pts.push([
      a * p0[0] + b * p1[0] + c * p2[0] + d * p3[0],
      a * p0[1] + b * p1[1] + c * p2[1] + d * p3[1],
    ]);
  }
  return pts;
}

// Expand OCAD bezier segments into plain vertices (clean OCAD units).
function flatten(coords: TdPoly[]): XY[] {
  const out: XY[] = [];
  let last: XY | null = null;
  let cp1: number[] | null = null;
  let cp2: number[] | null = null;
  for (const c of coords) {
    if (c.isFirstBezier()) {
      cp1 = [c[0], c[1]];
    } else if (c.isSecondBezier()) {
      cp2 = [c[0], c[1]];
    } else if (cp1 && cp2 && last) {
      for (const p of sampleCubic(last, cp1, cp2, [c[0], c[1]])) out.push(p);
      cp1 = cp2 = null;
      last = [c[0], c[1]];
    } else {
      const p: XY = [c[0], c[1]];
      out.push(p);
      last = p;
    }
  }
  return out;
}

// Split area coordinates into outer ring + holes, flattening beziers per ring.
function toRings(coords: TdPoly[]): XY[][] {
  const groups: TdPoly[][] = [[]];
  for (const c of coords) {
    if (c.isFirstHolePoint()) groups.push([]);
    groups[groups.length - 1].push(c);
  }
  return groups.map(flatten).filter((r) => r.length > 1);
}

/**
 * Parse an OCAD background map (.ocd) into simplified, projected drawable
 * features for the map canvas — directly from the object/symbol tables (the
 * same reliable readOcad path the course parser uses, no GeoJSON conversion).
 * Coordinates are EPSG-projected metres, matching the control positions, so
 * they align. Beziers are flattened, line widths and the OCAD colour render
 * order are honoured.
 */
export async function parseOcadBackground(file: File): Promise<OcadBackground> {
  const mod = await import("ocad2geojson");
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const m = mod as any;
  const ocad = await m.readOcad(Buffer.from(await file.arrayBuffer()));
  const crs = ocad.getCrs();
  // OCAD line widths are in 1/100 mm at map scale → ground metres.
  const scale: number = crs?.scale ?? 15000;
  const widthToMetres = (units: number) => units * scale * 1e-5;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const symByNum = new Map<number, any>();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const s of ocad.symbols as any[]) if (s) symByNum.set(s.symNum, s);

  const styleFor = (n: number): { color: string; order: number } => {
    const def = ocad.colors[n];
    return { color: def?.rgb ?? "rgb(160,160,160)", order: def?.renderOrder ?? 0 };
  };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const primaryColor = (s: any): number =>
    (s?.colors || []).find((c: number) => c > 0) ?? s?.color ?? 0;

  const project = (c: number[]): XY => crs.toProjectedCoord([c[0], c[1]]);

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
      const line = flatten(o.coordinates).map(project);
      for (const [x, y] of line) grow(x, y);
      features.push({
        kind: "line",
        color: st.color,
        order: st.order,
        alpha: 1,
        width: widthToMetres(s?.lineWidth ?? 0),
        coords: line,
      });
    } else if (ot === AREA) {
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
      const rings = toRings(o.coordinates).map((r) => r.map(project));
      for (const ring of rings) for (const [x, y] of ring) grow(x, y);
      if (rings.length) {
        features.push({ kind: "area", color: st.color, order: st.order, alpha, coords: rings });
      }
    }
  }

  // OCAD paints higher render-order colours first (further back); the canvas
  // paints features in array order with later ones on top, so draw highest
  // order first and lowest (streets, point features) last → on top.
  features.sort((a, b) => b.order - a.order);
  return { features, bounds: [minX, minY, maxX, maxY] };
}
