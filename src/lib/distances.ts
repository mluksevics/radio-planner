import { Coord } from "./types";

export const distanceMeters = (a: Coord, b: Coord): number =>
  Math.hypot(a.x - b.x, a.y - b.y);

export interface DistanceMatrix {
  /** codes that have a known position, in display order (finish last) */
  labels: string[];
  /** meters[i][j] = straight-line distance between labels[i] and labels[j]; null on the diagonal */
  meters: (number | null)[][];
}

/**
 * Straight-line distance matrix between the given control codes plus the
 * finishes (those with a known position), shown last. Codes without a position
 * are dropped. `finishCodes` are identified structurally by the caller.
 */
export function buildDistanceMatrix(
  coords: Record<string, Coord>,
  codes: string[],
  finishCodes: Set<string>,
): DistanceMatrix {
  const ordered = [
    ...codes.filter((c) => !finishCodes.has(c) && coords[c]),
    // all finishes with a known position, in order, shown last
    ...[...finishCodes]
      .filter((c) => coords[c])
      .sort((a, b) => a.localeCompare(b)),
  ];
  const meters = ordered.map((a) =>
    ordered.map((b) =>
      a === b ? null : distanceMeters(coords[a], coords[b]),
    ),
  );
  return { labels: ordered, meters };
}
