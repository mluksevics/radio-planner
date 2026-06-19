export type HeatScheme = "red" | "blue" | "magenta" | "green";

const HEAT_HUE: Record<Exclude<HeatScheme, "red">, number> = {
  blue: 210,
  magenta: 300,
  green: 140,
};

/**
 * Map a usage count to a heatmap background color (light -> deep). Default "red"
 * keeps the warm yellow→red ramp; other schemes ramp a single hue light→deep.
 */
export function heatColor(
  count: number,
  max: number,
  scheme: HeatScheme = "red",
): string {
  if (max <= 0) return "transparent";
  const t = Math.min(1, Math.max(0, count / max));
  const sat = 70 + 25 * t;
  if (scheme === "red") {
    // hue from 55 (pale yellow) -> 0 (red), saturation up, lightness down
    const hue = 55 - 55 * t;
    const light = 92 - 42 * t;
    return `hsl(${hue} ${sat}% ${light}%)`;
  }
  const light = 92 - 47 * t;
  return `hsl(${HEAT_HUE[scheme]} ${sat}% ${light}%)`;
}

/** Readable text color for a given heat intensity. */
export function heatText(count: number, max: number): string {
  if (max <= 0) return "inherit";
  const t = Math.min(1, Math.max(0, count / max));
  return t > 0.6 ? "#fff" : "#1a1a1a";
}

function hashControl(control: string): number {
  const num = Number(control);
  if (Number.isFinite(num)) return Math.abs(Math.round(num));
  let h = 0;
  for (const ch of control) h = (h * 31 + ch.charCodeAt(0)) | 0;
  return Math.abs(h);
}

/** Stable bright color unique-ish per control, used to highlight selected radio controls. */
export function radioColor(control: string): string {
  const hue = Math.round((hashControl(control) * 137.508) % 360);
  return `hsl(${hue} 85% 45%)`;
}

