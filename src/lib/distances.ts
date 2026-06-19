import { Coord } from "./types";

export const FINISH = "F1";

export const distanceMeters = (a: Coord, b: Coord): number =>
  Math.hypot(a.x - b.x, a.y - b.y);

export interface DistanceMatrix {
  /** codes that have a known position, in display order (finish last) */
  labels: string[];
  /** meters[i][j] = straight-line distance between labels[i] and labels[j]; null on the diagonal */
  meters: (number | null)[][];
}

/**
 * Straight-line distance matrix between the given control codes plus the finish
 * (if its position is known). Codes without a position are dropped.
 */
export function buildDistanceMatrix(
  coords: Record<string, Coord>,
  codes: string[],
): DistanceMatrix {
  const ordered = [
    ...codes.filter((c) => c !== FINISH && coords[c]),
    ...(coords[FINISH] ? [FINISH] : []),
  ];
  const meters = ordered.map((a) =>
    ordered.map((b) =>
      a === b ? null : distanceMeters(coords[a], coords[b]),
    ),
  );
  return { labels: ordered, meters };
}
