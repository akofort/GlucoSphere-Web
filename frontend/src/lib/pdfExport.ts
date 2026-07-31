import type { DashboardSeriesPoint } from "./api";
import { aidLabel, cgmLabel } from "./deviceLabels";
import { buildSparkline, SPARKLINE_H, SPARKLINE_W } from "./sparkline";
import { STRINGS } from "./strings";

// PDF export via the browser's own print dialog ("Save as PDF" destination) -- no client-side PDF
// library needed (avoids font/umlaut-rendering headaches jsPDF-style libraries have), works the
// same way in every modern browser. Mirrors the Android app's "Als PDF teilen" in spirit (a
// user-triggered export of one chat answer or the dashboard), not pixel-for-pixel.
export function printAsPdf(title: string, bodyHtml: string): void {
  const win = window.open("", "_blank");
  if (!win) return; // popup blocked -- nothing reasonable to do without a library fallback
  win.document.write(`<!doctype html>
<html lang="de">
<head>
<meta charset="utf-8">
<title>${escapeHtml(title)}</title>
<style>
  body { font-family: "Segoe UI", Roboto, sans-serif; padding: 32px; color: #201a18; max-width: 720px; margin: 0 auto; }
  h1 { font-size: 1.4rem; border-bottom: 2px solid #8b4f3f; padding-bottom: 8px; }
  h2 { font-size: 1.1rem; margin-top: 24px; }
  table { width: 100%; border-collapse: collapse; margin: 12px 0; }
  td { padding: 6px 0; border-bottom: 1px solid #ddd0ca; }
  td:last-child { text-align: right; font-weight: 600; }
  .meta { color: #5c534f; font-size: 0.85rem; margin-bottom: 20px; }
  .content { white-space: pre-wrap; line-height: 1.5; }
  /* Rendered chat Markdown -- .content's table/td rules above are for the plain metrics table,
     this covers real Markdown output (bold/lists/tables/code) so the printed page matches what
     was actually on screen instead of showing literal "**bold**"/"| a | b |" syntax. */
  .markdown { line-height: 1.5; }
  .markdown table { border: 1px solid #ddd0ca; }
  .markdown th, .markdown td { border: 1px solid #ddd0ca; padding: 6px 10px; text-align: left; font-weight: normal; }
  .markdown th { background: #f1e9e6; font-weight: 600; }
  .markdown ul, .markdown ol { padding-left: 1.4em; }
  .markdown code { background: #f1e9e6; border-radius: 4px; padding: 1px 5px; font-size: 0.9em; }
  .markdown pre { background: #f1e9e6; border-radius: 8px; padding: 10px; overflow-x: auto; }
  .markdown pre code { background: none; padding: 0; }
  .markdown blockquote { border-left: 3px solid #ddd0ca; margin: 0.5em 0; padding-left: 10px; color: #5c534f; }
  hr { border: none; border-top: 1px solid #ddd0ca; margin: 20px 0; }
  /* "Ausgewertet mit: ... / Quelle(n): ..." -- same attribution the Chat/Übersicht show on screen,
     so a printed report states which model and which data sources produced it. */
  .attribution { color: #5c534f; font-size: 0.8rem; margin-top: 16px; line-height: 1.5; }
  .notices { color: #5c534f; font-size: 0.8rem; line-height: 1.5; padding-left: 1.2em; margin-top: 8px; }
  .chart { display: block; margin: 4px 0 12px; }
  .disclaimer-footer { margin-top: 28px; padding-top: 12px; border-top: 1px solid #ddd0ca; font-size: 0.75rem; line-height: 1.4; color: #5c534f; }
  @media print { body { padding: 0; } }
</style>
</head>
<body>
<h1>${escapeHtml(title)}</h1>
<div class="meta">GlucoSphere -- ${new Date().toLocaleString()}</div>
${bodyHtml}
<div class="disclaimer-footer">
  <p>${escapeHtml(STRINGS.DE.aboutDisclaimerText)}</p>
  <p>${escapeHtml(STRINGS.EN.aboutDisclaimerText)}</p>
</div>
</body>
</html>`);
  win.document.close();
  win.focus();
  win.onload = () => win.print();
  // Some browsers fire onload before the write above is fully parsed -- print immediately too as
  // a fallback (calling print() twice is harmless, the dialog just stays open).
  setTimeout(() => win.print(), 300);
}

/** The "Ausgewertet mit: ... / Quelle(n): ..." block for a printed report -- built from the same
 * strings the screen uses, so PDF and app never drift apart. Returns "" when neither is known
 * (e.g. an answer given without any tool call and without provider metadata), safe to always
 * splice into a template string. */
export function attributionHtml(
  provider: string | null | undefined,
  model: string | null | undefined,
  sources: string[] | null | undefined,
  t: {
    overviewAnalyzedWith: (provider: string, model: string) => string;
    analyzedSources: (sources: string) => string;
  },
  providerLabel: (provider: string) => string,
): string {
  const lines: string[] = [];
  if (provider && model) lines.push(t.overviewAnalyzedWith(providerLabel(provider), model));
  if (sources && sources.length > 0) lines.push(t.analyzedSources(sources.join(", ")));
  if (lines.length === 0) return "";
  return `<p class="attribution">${lines.map(escapeHtml).join("<br>")}</p>`;
}

/** The glucose curve as a standalone inline SVG for the printed report -- same geometry as the
 * on-screen tile (see lib/sparkline.ts), but self-contained: the time labels are SVG <text>
 * elements rather than a positioned HTML overlay, and the colors are fixed print colors instead of
 * theme variables, which don't exist in the export window. */
export function chartHtml(
  series: DashboardSeriesPoint[] | undefined,
  locale: string,
  title: string,
): string {
  const paths = buildSparkline(series);
  if (!paths) return "";
  const labels = paths.ticks
    .map((tick, i) => {
      const x = (tick.pct / 100) * SPARKLINE_W;
      const anchor = i === 0 ? "start" : i === paths.ticks.length - 1 ? "end" : "middle";
      const text = new Date(tick.t).toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit" });
      return `<text x="${x.toFixed(1)}" y="${SPARKLINE_H + 12}" font-size="9" fill="#5c534f" text-anchor="${anchor}">${escapeHtml(text)}</text>`;
    })
    .join("");
  return `
    <h2>${escapeHtml(title)}</h2>
    <svg class="chart" viewBox="0 0 ${SPARKLINE_W} ${SPARKLINE_H + 16}" width="100%" height="180" preserveAspectRatio="none" role="img" aria-label="${escapeHtml(title)}">
      <line x1="0" y1="${paths.highY.toFixed(1)}" x2="${SPARKLINE_W}" y2="${paths.highY.toFixed(1)}" stroke="#8b4f3f" stroke-opacity="0.5" stroke-width="1" stroke-dasharray="6,4" />
      <line x1="0" y1="${paths.lowY.toFixed(1)}" x2="${SPARKLINE_W}" y2="${paths.lowY.toFixed(1)}" stroke="#8b4f3f" stroke-opacity="0.5" stroke-width="1" stroke-dasharray="6,4" />
      <path d="${paths.area}" fill="#8b4f3f" fill-opacity="0.12" stroke="none" />
      <path d="${paths.line}" fill="none" stroke="#5c534f" stroke-width="1.5" />
      ${labels}
    </svg>`;
}

/** Data-quality notices (missing-data gaps) for a printed report -- rendered verbatim, below the
 * attribution, exactly like on screen. Since the AI summary is explicitly told not to mention gaps
 * (see main.py's narrative prompt), this block is the only place a printed report states them. */
export function noticesHtml(notices: string[] | null | undefined): string {
  if (!notices || notices.length === 0) return "";
  return `<ul class="notices">${notices.map((n) => `<li>${escapeHtml(n)}</li>`).join("")}</ul>`;
}

export function escapeHtml(text: string): string {
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
}

/** For FACHPERSONAL (Typ 2) accounts, every report/PDF export gets an official patient header
 * prepended -- so a printed report is unambiguous about which patient it covers even outside the
 * app. Not shown for DIABETIKER (it's their own report) or ANGEHOERIGE (informal/no clinical
 * use). Returns "" when not applicable, safe to always splice into a template string. */
export function patientHeaderHtml(
  user: { userRole: string } | null | undefined,
  patientProfile: { firstName: string; lastName: string; birthDate: string; diabetesSince: string; cgmSystem: string; aidSystem: string; glucoseUnit: "MG_DL" | "MMOL_L" } | null | undefined,
  t: { profileDeviceNone: string; profileDeviceOther: string; reportPatientHeader: (fields: { name: string; birthDate: string; diabetesSince: string; cgm: string; aid: string; unit: string }) => string },
): string {
  if (user?.userRole !== "FACHPERSONAL" || !patientProfile) return "";
  const name = [patientProfile.firstName, patientProfile.lastName].filter(Boolean).join(" ") || "--";
  const line = t.reportPatientHeader({
    name,
    birthDate: patientProfile.birthDate || "--",
    diabetesSince: patientProfile.diabetesSince || "--",
    cgm: cgmLabel(patientProfile.cgmSystem, t),
    aid: aidLabel(patientProfile.aidSystem, t),
    unit: patientProfile.glucoseUnit === "MMOL_L" ? "mmol/L" : "mg/dL",
  });
  return `<p class="patient-header"><strong>${escapeHtml(line)}</strong></p>`;
}
