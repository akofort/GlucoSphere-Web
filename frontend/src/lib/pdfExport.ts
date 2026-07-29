import { cgmLabel, pumpLabel } from "./deviceLabels";

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
  @media print { body { padding: 0; } }
</style>
</head>
<body>
<h1>${escapeHtml(title)}</h1>
<div class="meta">GlucoSphere -- ${new Date().toLocaleString()}</div>
${bodyHtml}
</body>
</html>`);
  win.document.close();
  win.focus();
  win.onload = () => win.print();
  // Some browsers fire onload before the write above is fully parsed -- print immediately too as
  // a fallback (calling print() twice is harmless, the dialog just stays open).
  setTimeout(() => win.print(), 300);
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
  patientProfile: { firstName: string; lastName: string; birthDate: string; diabetesSince: string; cgmSystem: string; insulinPump: string } | null | undefined,
  t: { profileDeviceNone: string; profileDeviceOther: string; reportPatientHeader: (fields: { name: string; birthDate: string; diabetesSince: string; cgm: string; pump: string }) => string },
): string {
  if (user?.userRole !== "FACHPERSONAL" || !patientProfile) return "";
  const name = [patientProfile.firstName, patientProfile.lastName].filter(Boolean).join(" ") || "--";
  const line = t.reportPatientHeader({
    name,
    birthDate: patientProfile.birthDate || "--",
    diabetesSince: patientProfile.diabetesSince || "--",
    cgm: cgmLabel(patientProfile.cgmSystem, t),
    pump: pumpLabel(patientProfile.insulinPump, t),
  });
  return `<p class="patient-header"><strong>${escapeHtml(line)}</strong></p>`;
}
