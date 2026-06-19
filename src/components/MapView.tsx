"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Coord, RadioControl } from "@/lib/types";
import { OcadBackground, Bounds } from "@/lib/ocadBackground";
import { buildDistanceMatrix, FINISH } from "@/lib/distances";
import { radioColor } from "@/lib/heatmap";

interface Props {
  coords: Record<string, Coord>;
  background: OcadBackground | null;
  selection: Record<string, RadioControl>;
  onToggle: (control: string) => void;
}

interface View {
  k: number;
  tx: number;
  ty: number;
}

const BG_MAX = 2400; // px for the longest side of the offscreen background
const isStart = (code: string) => /^S\d+/.test(code);

export default function MapView({
  coords,
  background,
  selection,
  onToggle,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [view, setView] = useState<View>({ k: 1, tx: 0, ty: 0 });
  const lastFitRef = useRef<Bounds | null>(null);

  const codes = useMemo(() => Object.keys(coords), [coords]);
  const hasData = codes.length > 0;

  // world bounds (projected metres) + base scale (px per metre for offscreen)
  const worldBounds = useMemo<Bounds | null>(() => {
    if (background) return background.bounds;
    if (!hasData) return null;
    let minX = Infinity,
      minY = Infinity,
      maxX = -Infinity,
      maxY = -Infinity;
    for (const c of codes) {
      const p = coords[c];
      if (p.x < minX) minX = p.x;
      if (p.y < minY) minY = p.y;
      if (p.x > maxX) maxX = p.x;
      if (p.y > maxY) maxY = p.y;
    }
    const pad = Math.max(50, (maxX - minX || 100) * 0.05);
    return [minX - pad, minY - pad, maxX + pad, maxY + pad];
  }, [background, hasData, codes, coords]);

  const baseScale = useMemo(() => {
    if (!worldBounds) return 1;
    const [minX, minY, maxX, maxY] = worldBounds;
    const dim = Math.max(maxX - minX, maxY - minY) || 1;
    return BG_MAX / dim;
  }, [worldBounds]);

  // world -> base px (offscreen pixel space; y flipped)
  const toBasePx = useCallback(
    (p: Coord): [number, number] => {
      if (!worldBounds) return [0, 0];
      const [minX, , , maxY] = worldBounds;
      return [(p.x - minX) * baseScale, (maxY - p.y) * baseScale];
    },
    [worldBounds, baseScale],
  );

  // measure container
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      setSize({ w: el.clientWidth, h: el.clientHeight });
    });
    ro.observe(el);
    setSize({ w: el.clientWidth, h: el.clientHeight });
    return () => ro.disconnect();
  }, []);

  // render the background once to an offscreen canvas (pure: no React state)
  const offscreen = useMemo<HTMLCanvasElement | null>(() => {
    if (typeof document === "undefined") return null; // SSR guard
    if (!background || !worldBounds) return null;
    const [minX, , , maxY] = worldBounds;
    const w = Math.max(1, Math.round((worldBounds[2] - worldBounds[0]) * baseScale));
    const h = Math.max(1, Math.round((maxY - worldBounds[1]) * baseScale));
    const off = document.createElement("canvas");
    off.width = w;
    off.height = h;
    const ctx = off.getContext("2d");
    if (!ctx) return null;
    ctx.fillStyle = "#fefefc";
    ctx.fillRect(0, 0, w, h);
    const px = (x: number) => (x - minX) * baseScale;
    const py = (y: number) => (maxY - y) * baseScale;
    for (const f of background.features) {
      if (f.kind === "area") {
        ctx.fillStyle = f.color;
        ctx.beginPath();
        (f.coords as number[][]).forEach(([x, y], i) =>
          i === 0 ? ctx.moveTo(px(x), py(y)) : ctx.lineTo(px(x), py(y)),
        );
        ctx.closePath();
        ctx.fill();
      } else if (f.kind === "line") {
        ctx.strokeStyle = f.color;
        ctx.lineWidth = 1;
        ctx.beginPath();
        (f.coords as number[][]).forEach(([x, y], i) =>
          i === 0 ? ctx.moveTo(px(x), py(y)) : ctx.lineTo(px(x), py(y)),
        );
        ctx.stroke();
      } else {
        const [x, y] = f.coords as number[];
        ctx.fillStyle = f.color;
        ctx.fillRect(px(x) - 1, py(y) - 1, 2, 2);
      }
    }
    return off;
  }, [background, worldBounds, baseScale]);

  // fit to view once data + size are available
  const fit = useCallback(() => {
    if (!worldBounds || size.w === 0 || size.h === 0) return;
    const bgW = (worldBounds[2] - worldBounds[0]) * baseScale;
    const bgH = (worldBounds[3] - worldBounds[1]) * baseScale;
    const k = Math.min(size.w / bgW, size.h / bgH) * 0.95;
    setView({
      k,
      tx: (size.w - bgW * k) / 2,
      ty: (size.h - bgH * k) / 2,
    });
  }, [worldBounds, baseScale, size]);

  // (re)fit whenever the world bounds change (new course / background loaded)
  // or once the container has been measured; manual pan/zoom leaves bounds
  // unchanged so it is not overridden.
  useEffect(() => {
    if (worldBounds && size.w > 0 && lastFitRef.current !== worldBounds) {
      fit();
      lastFitRef.current = worldBounds;
    }
  }, [worldBounds, size, fit]);

  // draw visible canvas
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || size.w === 0) return;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = size.w * dpr;
    canvas.height = size.h * dpr;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = "#f4f4f0";
    ctx.fillRect(0, 0, size.w, size.h);
    if (offscreen) {
      ctx.imageSmoothingEnabled = true;
      ctx.drawImage(
        offscreen,
        view.tx,
        view.ty,
        offscreen.width * view.k,
        offscreen.height * view.k,
      );
    }
  }, [view, size, offscreen]);

  // markers in screen space
  const markers = useMemo(() => {
    return codes.map((code) => {
      const [bx, by] = toBasePx(coords[code]);
      return {
        code,
        sx: bx * view.k + view.tx,
        sy: by * view.k + view.ty,
        selected: !!selection[code],
        start: isStart(code),
        finish: code === FINISH,
      };
    });
  }, [codes, coords, toBasePx, view, selection]);

  const matrix = useMemo(
    () =>
      buildDistanceMatrix(
        coords,
        Object.keys(selection).filter((c) => coords[c] && !isStart(c)),
      ),
    [coords, selection],
  );

  // wheel zoom (non-passive) + drag pan
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const rect = el.getBoundingClientRect();
      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;
      setView((v) => {
        const k2 = Math.min(40, Math.max(0.02, v.k * (e.deltaY < 0 ? 1.1 : 1 / 1.1)));
        const bx = (mx - v.tx) / v.k;
        const by = (my - v.ty) / v.k;
        return { k: k2, tx: mx - bx * k2, ty: my - by * k2 };
      });
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, []);

  const drag = useRef<{ x: number; y: number } | null>(null);
  const onMouseDown = (e: React.MouseEvent) => {
    drag.current = { x: e.clientX, y: e.clientY };
  };
  const onMouseMove = (e: React.MouseEvent) => {
    if (!drag.current) return;
    const dx = e.clientX - drag.current.x;
    const dy = e.clientY - drag.current.y;
    drag.current = { x: e.clientX, y: e.clientY };
    setView((v) => ({ ...v, tx: v.tx + dx, ty: v.ty + dy }));
  };
  const endDrag = () => {
    drag.current = null;
  };

  if (!hasData) {
    return (
      <div className="flex h-full items-center justify-center rounded border border-gray-200 bg-gray-50 p-6 text-center">
        <p className="max-w-sm text-sm text-gray-500">
          No control coordinates yet. Upload an OCAD course file (Data ▾) to see
          controls on the map. Text imports have no coordinates.
        </p>
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 gap-2">
      <div
        ref={containerRef}
        className="relative min-h-0 flex-1 cursor-grab overflow-hidden rounded border border-gray-200 active:cursor-grabbing"
        onMouseDown={onMouseDown}
        onMouseMove={onMouseMove}
        onMouseUp={endDrag}
        onMouseLeave={endDrag}
      >
        <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" />
        <svg className="pointer-events-none absolute inset-0 h-full w-full">
          {markers.map((m) => {
            if (m.start) {
              return (
                <g key={m.code}>
                  <polygon
                    points={`${m.sx},${m.sy - 9} ${m.sx - 8},${m.sy + 6} ${m.sx + 8},${m.sy + 6}`}
                    fill="none"
                    stroke="#7c3aed"
                    strokeWidth={2}
                  />
                </g>
              );
            }
            if (m.finish) {
              return (
                <g key={m.code}>
                  <circle cx={m.sx} cy={m.sy} r={8} fill="none" stroke="#7c3aed" strokeWidth={2} />
                  <circle cx={m.sx} cy={m.sy} r={4} fill="none" stroke="#7c3aed" strokeWidth={2} />
                </g>
              );
            }
            const color = m.selected ? radioColor(m.code) : "#7c3aed";
            return (
              <g
                key={m.code}
                className="pointer-events-auto cursor-pointer"
                onClick={(e) => {
                  e.stopPropagation();
                  onToggle(m.code);
                }}
                onMouseDown={(e) => e.stopPropagation()}
              >
                <circle
                  cx={m.sx}
                  cy={m.sy}
                  r={m.selected ? 8 : 5}
                  fill={m.selected ? color : "white"}
                  fillOpacity={m.selected ? 0.85 : 0.6}
                  stroke={color}
                  strokeWidth={m.selected ? 3 : 1.5}
                />
                <text
                  x={m.sx + 9}
                  y={m.sy - 6}
                  fontSize={11}
                  fontWeight={m.selected ? 700 : 400}
                  fill={m.selected ? color : "#374151"}
                  paintOrder="stroke"
                  stroke="white"
                  strokeWidth={3}
                >
                  {m.code}
                </text>
              </g>
            );
          })}
        </svg>
        <button
          type="button"
          onClick={fit}
          className="absolute left-2 top-2 rounded border border-gray-300 bg-white/90 px-2 py-1 text-xs font-medium shadow hover:bg-white"
        >
          Fit
        </button>
        <div className="pointer-events-none absolute bottom-2 left-2 rounded bg-white/80 px-2 py-1 text-[10px] text-gray-500">
          Scroll to zoom · drag to pan · click a control to toggle radio
        </div>
      </div>

      <DistancePanel matrix={matrix} />
    </div>
  );
}

function DistancePanel({
  matrix,
}: {
  matrix: ReturnType<typeof buildDistanceMatrix>;
}) {
  if (matrix.labels.length < 2) {
    return (
      <div className="w-56 shrink-0 overflow-auto rounded border border-gray-200 p-3 text-xs text-gray-500">
        Select radio controls (here or in the table) to see straight-line
        distances between them and the finish.
      </div>
    );
  }
  const fmt = (m: number | null) => (m == null ? "" : `${Math.round(m)}`);
  return (
    <div className="w-72 shrink-0 overflow-auto rounded border border-gray-200">
      <div className="border-b border-gray-200 bg-gray-50 px-2 py-1.5 text-xs font-semibold text-gray-600">
        Straight-line distances (m)
      </div>
      <table className="text-[11px] tabular-nums">
        <thead>
          <tr className="text-gray-500">
            <th className="px-2 py-1"></th>
            {matrix.labels.map((l) => (
              <th
                key={l}
                className="px-2 py-1 text-right font-semibold"
                style={{ color: l === FINISH ? "#7c3aed" : radioColor(l) }}
              >
                {l}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {matrix.labels.map((row, i) => (
            <tr key={row} className="border-t border-gray-100">
              <th
                className="px-2 py-1 text-left font-semibold"
                style={{ color: row === FINISH ? "#7c3aed" : radioColor(row) }}
              >
                {row}
              </th>
              {matrix.labels.map((col, j) => (
                <td
                  key={col}
                  className={`px-2 py-1 text-right ${i === j ? "bg-gray-50 text-gray-300" : "text-gray-700"}`}
                >
                  {i === j ? "—" : fmt(matrix.meters[i][j])}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
