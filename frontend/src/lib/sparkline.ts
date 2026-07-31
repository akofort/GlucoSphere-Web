import type { DashboardSeriesPoint } from "./api";

export const SPARKLINE_W = 400;
export const SPARKLINE_H = 140;
export const TARGET_LOW_MGDL = 70;
export const TARGET_HIGH_MGDL = 180;
export const SPARKLINE_TICK_COUNT = 4;

export interface SparklinePaths {
  line: string;
  area: string;
  lowY: number;
  highY: number;
  ticks: { pct: number; t: number }[];
}

/** SVG line+fill path for a glucose curve, plus target-range (70-180 mg/dL) reference-line Y
 * positions and evenly spaced time-axis ticks. The Y domain always includes 70-180 (not just the
 * series' own min/max) so the reference lines stay meaningful even when the trace never leaves the
 * target range.
 *
 * Lives here rather than in the tile component because the PDF export draws the same curve into a
 * standalone SVG (see pdfExport.ts's chartHtml) -- one geometry, two renderers. */
export function buildSparkline(series: DashboardSeriesPoint[] | undefined): SparklinePaths | null {
  if (!series || series.length < 2) return null;
  const times = series.map((p) => p.t);
  const values = series.map((p) => p.v);
  const minT = Math.min(...times);
  const maxT = Math.max(...times);
  const rawMinV = Math.min(...values, TARGET_LOW_MGDL);
  const rawMaxV = Math.max(...values, TARGET_HIGH_MGDL);
  const pad = Math.max(10, (rawMaxV - rawMinV) * 0.1);
  const loV = rawMinV - pad;
  const hiV = rawMaxV + pad;
  const spanT = maxT - minT || 1;
  const spanV = hiV - loV || 1;
  const x = (t: number) => ((t - minT) / spanT) * SPARKLINE_W;
  const y = (v: number) => SPARKLINE_H - ((v - loV) / spanV) * SPARKLINE_H;
  const points = series.map((p) => `${x(p.t).toFixed(1)},${y(p.v).toFixed(1)}`);
  const line = `M${points.join("L")}`;
  const area = `${line}L${SPARKLINE_W},${SPARKLINE_H}L0,${SPARKLINE_H}Z`;
  const ticks = Array.from({ length: SPARKLINE_TICK_COUNT + 1 }, (_, i) => {
    const fraction = i / SPARKLINE_TICK_COUNT;
    return { pct: fraction * 100, t: minT + spanT * fraction };
  });
  return { line, area, lowY: y(TARGET_LOW_MGDL), highY: y(TARGET_HIGH_MGDL), ticks };
}
