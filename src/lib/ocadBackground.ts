import { Buffer } from "buffer";

export type Bounds = [number, number, number, number]; // [minX, minY, maxX, maxY]

export interface DrawFeature {
  kind: "area" | "line" | "point";
  /** rgb() string */
  color: string;
  /** lower draws first (OCAD color render order) */
  order: number;
  /** area: number[][][] rings; line: number[][]; point: [x,y] (projected metres) */
  coords: number[][][] | number[][] | number[];
}

export interface OcadBackground {
  features: DrawFeature[];
  bounds: Bounds;
}

/**
 * Parse an OCAD background map (.ocd) into simplified, projected drawable
 * features for the map canvas. Areas and lines are kept with their OCAD colour;
 * point symbols are kept as coloured dots. Coordinates are EPSG-projected metres,
 * matching the control positions from the course file (same CRS), so they align.
 */
export async function parseOcadBackground(file: File): Promise<OcadBackground> {
  const mod = await import("ocad2geojson");
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const m = mod as any;
  const ocad = await m.readOcad(Buffer.from(await file.arrayBuffer()));
  const gj = m.ocadToGeoJson(ocad, { applyCrs: true });

  const colorRgb = (n: number): string => ocad.colors[n]?.rgb ?? "rgb(120,120,120)";
  const colorOrder = (n: number): number => ocad.colors[n]?.renderOrder ?? 0;

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
  for (const f of gj.features as any[]) {
    const col = f.properties?.col ?? 0;
    const color = colorRgb(col);
    const order = colorOrder(col);
    const g = f.geometry;
    if (g.type === "Polygon") {
      const rings = g.coordinates as number[][][];
      for (const ring of rings) for (const [x, y] of ring) grow(x, y);
      features.push({ kind: "area", color, order, coords: rings });
    } else if (g.type === "LineString") {
      const line = g.coordinates as number[][];
      for (const [x, y] of line) grow(x, y);
      features.push({ kind: "line", color, order, coords: line });
    } else if (g.type === "Point") {
      const pt = g.coordinates as number[];
      grow(pt[0], pt[1]);
      features.push({ kind: "point", color, order, coords: pt });
    }
  }

  // draw lowest render order first
  features.sort((a, b) => a.order - b.order);

  return { features, bounds: [minX, minY, maxX, maxY] };
}
