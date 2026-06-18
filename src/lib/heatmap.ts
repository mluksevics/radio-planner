/** Map a usage count to a heatmap background color (light -> deep amber/red). */
export function heatColor(count: number, max: number): string {
  if (max <= 0) return "transparent";
  const t = Math.min(1, Math.max(0, count / max));
  // hue from 55 (pale yellow) -> 0 (red), saturation up, lightness down
  const hue = 55 - 55 * t;
  const sat = 70 + 25 * t;
  const light = 92 - 42 * t;
  return `hsl(${hue} ${sat}% ${light}%)`;
}

/** Readable text color for a given heat intensity. */
export function heatText(count: number, max: number): string {
  if (max <= 0) return "inherit";
  const t = Math.min(1, Math.max(0, count / max));
  return t > 0.6 ? "#fff" : "#1a1a1a";
}
