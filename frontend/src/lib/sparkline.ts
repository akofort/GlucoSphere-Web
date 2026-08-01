import type { DashboardSeriesPoint } from "./api";

export const SPARKLINE_W = 400;
export const SPARKLINE_H = 140;
export const TARGET_LOW_MGDL = 70;
export const TARGET_HIGH_MGDL = 180;
export const SPARKLINE_TICK_COUNT = 4;

/** The time window the X axis spans. Without it the axis is scaled to the data itself, which draws
 * the newest reading hard against the right edge -- i.e. it looks like data exists up to now, even
 * when the source went silent hours ago. Pass the requested window and the curve ends where the
 * data ends. */
export interface SparklineDomain {
  from: number;
  to: number;
}

export interface SparklinePaths {
  line: string;
  area: string;
  lowY: number;
  highY: number;
  ticks: { pct: number; t: number }[];
  /** Position of the newest reading, for the "data ends here" marker. */
  lastX: number;
  lastY: number;
  /** How far the newest reading sits from the right edge, 0-100% of the chart width. Lets callers
   * decide whether the gap is worth pointing out in words. */
  gapPercent: number;
}

/** SVG line+fill path for a glucose curve, plus target-range (70-180 mg/dL) reference-line Y
 * positions and evenly spaced time-axis ticks. The Y domain always includes 70-180 (not just the
 * series' own min/max) so the reference lines stay meaningful even when the trace never leaves the
 * target range.
 *
 * Lives here rather than in the tile component because the PDF export draws the same curve into a
 * standalone SVG (see pdfExport.ts's chartHtml) -- one geometry, two renderers. */
export function buildSparkline(
  series: DashboardSeriesPoint[] | undefined,
  domain?: SparklineDomain,
): SparklinePaths | null {
  const points = domain
    ? (series ?? []).filter((p) => p.t >= domain.from && p.t <= domain.to)
    : series ?? [];
  if (points.length < 2) return null;
  const times = points.map((p) => p.t);
  const values = points.map((p) => p.v);
  const minT = domain ? domain.from : Math.min(...times);
  const maxT = domain ? domain.to : Math.max(...times);
  const rawMinV = Math.min(...values, TARGET_LOW_MGDL);
  const rawMaxV = Math.max(...values, TARGET_HIGH_MGDL);
  const pad = Math.max(10, (rawMaxV - rawMinV) * 0.1);
  const loV = rawMinV - pad;
  const hiV = rawMaxV + pad;
  const spanT = maxT - minT || 1;
  const spanV = hiV - loV || 1;
  const x = (t: number) => ((t - minT) / spanT) * SPARKLINE_W;
  const y = (v: number) => SPARKLINE_H - ((v - loV) / spanV) * SPARKLINE_H;
  const coords = points.map((p) => ({ x: x(p.t), y: y(p.v) }));
  const line = `M${coords.map((c) => `${c.x.toFixed(1)},${c.y.toFixed(1)}`).join("L")}`;
  const first = coords[0];
  const last = coords[coords.length - 1];
  // The fill is closed under the FIRST and LAST reading, not across the full width -- otherwise it
  // would paint the empty stretch after the last reading as if it were data.
  const area = `${line}L${last.x.toFixed(1)},${SPARKLINE_H}L${first.x.toFixed(1)},${SPARKLINE_H}Z`;
  const ticks = Array.from({ length: SPARKLINE_TICK_COUNT + 1 }, (_, i) => {
    const fraction = i / SPARKLINE_TICK_COUNT;
    return { pct: fraction * 100, t: minT + spanT * fraction };
  });
  return {
    line,
    area,
    lowY: y(TARGET_LOW_MGDL),
    highY: y(TARGET_HIGH_MGDL),
    ticks,
    lastX: last.x,
    lastY: last.y,
    gapPercent: ((SPARKLINE_W - last.x) / SPARKLINE_W) * 100,
  };
}
