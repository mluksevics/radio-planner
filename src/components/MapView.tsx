"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Coord, RadioControl } from "@/lib/types";
import { LegUsage } from "@/lib/analysis";
import { OcadBackground, Bounds } from "@/lib/ocadBackground";
import { buildDistanceMatrix } from "@/lib/distances";
import { heatColor, radioColor, HeatScheme } from "@/lib/heatmap";

interface Props {
  coords: Record<string, Coord>;
  background: OcadBackground | null;
  selection: Record<string, RadioControl>;
  legs: LegUsage[];
  legRank: Map<string, number>;
  legMaxRank: number;
  /** structurally-identified start / finish codes (not name-based) */
  startCodes: Set<string>;
  finishCodes: Set<string>;
  heatRank: Map<string, number>;
  maxRank: number;
  usage: Map<string, number>;
  onToggle: (control: string) => void;
}

interface View {
  k: number;
  tx: number;
  ty: number;
}

const BG_MAX = 2400; // px for the longest side of the offscreen background
const BG_OPACITY_KEY = "radio-bg-opacity";
const VIEW_KEY = "radio-map-view";

// signature of the things the screen-space view depends on; a saved view is
// only valid (restorable) while this is unchanged — otherwise we re-fit.
const viewSig = (bounds: Bounds, w: number, h: number) =>
  `${bounds.map((n) => Math.round(n)).join(",")}|${Math.round(w)}x${Math.round(h)}`;

export default function MapView({
  coords,
  background,
  selection,
  legs,
  legRank,
  legMaxRank,
  startCodes,
  finishCodes,
  heatRank,
  maxRank,
  usage,
  onToggle,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [view, setView] = useState<View>({ k: 1, tx: 0, ty: 0 });
  const [bgOpacity, setBgOpacity] = useState(0.7);
  const [showLegs, setShowLegs] = useState(true);
  const [showControlHeat, setShowControlHeat] = useState(true);
  // fraction of the rank scale at which heat saturates to red (lower = top
  // legs/controls all red, finer gradient among the less-used ones)
  const [heatCeil, setHeatCeil] = useState(1);
  const [heatScheme, setHeatScheme] = useState<HeatScheme>("red");
  const lastFitRef = useRef<Bounds | null>(null);
  const viewReadyRef = useRef(false);

  // restore persisted map opacity (state resets on tab switch / remount)
  useEffect(() => {
    const v = Number(window.localStorage.getItem(BG_OPACITY_KEY));
    if (Number.isFinite(v) && v >= 0 && v <= 1) setBgOpacity(v);
  }, []);

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
      ctx.globalAlpha = f.alpha;
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
    if (!worldBounds || size.w === 0 || size.h === 0) return;
    if (lastFitRef.current === worldBounds) return;
    lastFitRef.current = worldBounds;
    // restore a saved view if it still matches the current bounds/size,
    // otherwise fit. Either way the view is now "ready" to be persisted.
    const sig = viewSig(worldBounds, size.w, size.h);
    try {
      const raw = window.localStorage.getItem(VIEW_KEY);
      const v = raw ? JSON.parse(raw) : null;
      if (v && v.sig === sig && Number.isFinite(v.k)) {
        setView({ k: v.k, tx: v.tx, ty: v.ty });
        viewReadyRef.current = true;
        return;
      }
    } catch {
      /* ignore malformed storage */
    }
    fit();
    viewReadyRef.current = true;
  }, [worldBounds, size, fit]);

  // persist the view (zoom + pan) shortly after it settles, tagged with the
  // signature it is valid for, so it survives tab switches / reloads
  useEffect(() => {
    if (!viewReadyRef.current || !worldBounds || size.w === 0) return;
    const sig = viewSig(worldBounds, size.w, size.h);
    const id = setTimeout(() => {
      try {
        window.localStorage.setItem(VIEW_KEY, JSON.stringify({ ...view, sig }));
      } catch {
        /* ignore quota errors */
      }
    }, 250);
    return () => clearTimeout(id);
  }, [view, worldBounds, size]);

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
      ctx.globalAlpha = bgOpacity;
      ctx.drawImage(
        offscreen,
        view.tx,
        view.ty,
        offscreen.width * view.k,
        offscreen.height * view.k,
      );
      ctx.globalAlpha = 1;
    }
  }, [view, size, offscreen, bgOpacity]);

  // markers in screen space
  const markers = useMemo(() => {
    return codes.map((code) => {
      const [bx, by] = toBasePx(coords[code]);
      return {
        code,
        sx: bx * view.k + view.tx,
        sy: by * view.k + view.ty,
        selected: !!selection[code],
        start: startCodes.has(code),
        finish: finishCodes.has(code),
      };
    });
  }, [codes, coords, toBasePx, view, selection, startCodes, finishCodes]);

  // leg segments (spiderweb) in screen space, colored by usage heat
  const legSegments = useMemo(() => {
    if (!showLegs) return [];
    const effMax = Math.max(1, Math.round(legMaxRank * heatCeil));
    return legs.flatMap((l) => {
      const pa = coords[l.a];
      const pb = coords[l.b];
      if (!pa || !pb) return [];
      const [ax, ay] = toBasePx(pa);
      const [bx, by] = toBasePx(pb);
      const rank = legRank.get(l.key) ?? 0;
      const t = Math.min(1, rank / effMax);
      return [
        {
          key: l.key,
          x1: ax * view.k + view.tx,
          y1: ay * view.k + view.ty,
          x2: bx * view.k + view.tx,
          y2: by * view.k + view.ty,
          color: heatColor(rank, effMax, heatScheme),
          width: 1.5 + 4.5 * t,
          count: l.count,
          a: l.a,
          b: l.b,
        },
      ];
    });
  }, [showLegs, legs, coords, toBasePx, view, legRank, legMaxRank, heatCeil, heatScheme]);

  const matrix = useMemo(
    () =>
      buildDistanceMatrix(
        coords,
        Object.keys(selection).filter((c) => coords[c] && !startCodes.has(c)),
        finishCodes,
      ),
    [coords, selection, startCodes, finishCodes],
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
          {legSegments.map((s) => (
            <line
              key={s.key}
              x1={s.x1}
              y1={s.y1}
              x2={s.x2}
              y2={s.y2}
              stroke={s.color}
              strokeWidth={s.width}
              strokeLinecap="round"
              opacity={0.8}
            >
              <title>{`${s.a}–${s.b}: used in ${s.count} ${s.count === 1 ? "class" : "classes"}`}</title>
            </line>
          ))}
          {markers.map((m) => {
            if (m.start || m.finish) {
              const n = usage.get(m.code) ?? 0;
              return (
                <g key={m.code} className="pointer-events-auto cursor-help">
                  <title>{`${m.code}: used in ${n} ${n === 1 ? "class" : "classes"}`}</title>
                  {/* invisible hit area so hover works over the whole glyph */}
                  <circle cx={m.sx} cy={m.sy} r={10} fill="transparent" />
                  {m.start ? (
                    <polygon
                      points={`${m.sx},${m.sy - 9} ${m.sx - 8},${m.sy + 6} ${m.sx + 8},${m.sy + 6}`}
                      fill="none"
                      stroke="#7c3aed"
                      strokeWidth={2}
                    />
                  ) : (
                    <>
                      <circle cx={m.sx} cy={m.sy} r={8} fill="none" stroke="#7c3aed" strokeWidth={2} />
                      <circle cx={m.sx} cy={m.sy} r={4} fill="none" stroke="#7c3aed" strokeWidth={2} />
                    </>
                  )}
                  <text
                    x={m.sx + 11}
                    y={m.sy - 6}
                    fontSize={11}
                    fontWeight={700}
                    fill="#7c3aed"
                    paintOrder="stroke"
                    stroke="white"
                    strokeWidth={3}
                  >
                    {m.code}
                  </text>
                </g>
              );
            }
            const color = m.selected ? radioColor(m.code) : "#7c3aed";
            const heat =
              showControlHeat && !m.selected
                ? heatColor(
                    heatRank.get(m.code) ?? 0,
                    Math.max(1, Math.round(maxRank * heatCeil)),
                    heatScheme,
                  )
                : null;
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
                <title>{`${m.code}: used in ${usage.get(m.code) ?? 0} ${
                  (usage.get(m.code) ?? 0) === 1 ? "class" : "classes"
                }`}</title>
                <circle
                  cx={m.sx}
                  cy={m.sy}
                  r={m.selected ? 8 : 5}
                  fill={m.selected ? color : (heat ?? "white")}
                  fillOpacity={m.selected ? 0.85 : heat ? 0.9 : 0.6}
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
        <div className="absolute left-2 top-2 flex flex-col items-start gap-1">
          <div className="flex gap-1">
          <button
            type="button"
            onClick={fit}
            className="rounded border border-gray-300 bg-white/90 px-2 py-1 text-xs font-medium shadow hover:bg-white"
          >
            Fit
          </button>
          <button
            type="button"
            onClick={() => setShowLegs((v) => !v)}
            className={`rounded border px-2 py-1 text-xs font-medium shadow ${
              showLegs
                ? "border-amber-400 bg-amber-50 text-amber-800"
                : "border-gray-300 bg-white/90 text-gray-600 hover:bg-white"
            }`}
            title="Color course legs by how often they are used"
          >
            Legs heatmap
          </button>
          <button
            type="button"
            onClick={() => setShowControlHeat((v) => !v)}
            className={`rounded border px-2 py-1 text-xs font-medium shadow ${
              showControlHeat
                ? "border-amber-400 bg-amber-50 text-amber-800"
                : "border-gray-300 bg-white/90 text-gray-600 hover:bg-white"
            }`}
            title="Color controls by how often they are used"
          >
            Controls heatmap
          </button>
          </div>
          {(showLegs || showControlHeat) && (
            <div
              className="flex items-center gap-2 rounded border border-gray-300 bg-white/90 px-2 py-1 text-[11px] text-gray-600 shadow"
              onMouseDown={(e) => e.stopPropagation()}
              title="Lower the heat range so the most-used legs/controls saturate to red and the less-used ones spread across more colors"
            >
              <span className="whitespace-nowrap">Heat range</span>
              <input
                type="range"
                min={20}
                max={100}
                value={Math.round(heatCeil * 100)}
                onChange={(e) => setHeatCeil(Number(e.target.value) / 100)}
                className="w-24"
                aria-label="Heatmap upper range"
              />
              <span className="w-8 text-right tabular-nums">
                {Math.round(heatCeil * 100)}%
              </span>
              <select
                value={heatScheme}
                onChange={(e) => setHeatScheme(e.target.value as HeatScheme)}
                className="rounded border border-gray-300 bg-white px-1 py-0.5 text-[11px]"
                aria-label="Heat color"
                title="Heatmap color"
              >
                <option value="red">Red</option>
                <option value="blue">Blue</option>
                <option value="magenta">Magenta</option>
                <option value="green">Green</option>
              </select>
            </div>
          )}
        </div>
        <div className="pointer-events-none absolute bottom-2 left-2 rounded bg-white/80 px-2 py-1 text-[10px] text-gray-500">
          Scroll to zoom · drag to pan · click a control to toggle radio
        </div>
        {background && (
          <div
            className="absolute bottom-2 right-2 flex items-center gap-2 rounded bg-white/90 px-2 py-1 text-[11px] text-gray-600 shadow"
            onMouseDown={(e) => e.stopPropagation()}
          >
            <span>Map opacity</span>
            <input
              type="range"
              min={0}
              max={100}
              value={Math.round(bgOpacity * 100)}
              onChange={(e) => {
                const v = Number(e.target.value) / 100;
                setBgOpacity(v);
                window.localStorage.setItem(BG_OPACITY_KEY, String(v));
              }}
              className="w-28"
            />
            <span className="w-9 text-right tabular-nums">
              {Math.round(bgOpacity * 100)}%
            </span>
          </div>
        )}
      </div>

      <DistancePanel matrix={matrix} finishCodes={finishCodes} />
    </div>
  );
}

function DistancePanel({
  matrix,
  finishCodes,
}: {
  matrix: ReturnType<typeof buildDistanceMatrix>;
  finishCodes: Set<string>;
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
                style={{ color: finishCodes.has(l) ? "#7c3aed" : radioColor(l) }}
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
                style={{ color: finishCodes.has(row) ? "#7c3aed" : radioColor(row) }}
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
