import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { api, type Dashboard, type DashboardSource } from "../lib/api";
import { DocumentIcon, LogoutIcon, RefreshIcon, SpeakerIcon, StopIcon } from "../components/Icons";
import LiveGlucoseTile from "../components/LiveGlucoseTile";
import NoticeList from "../components/NoticeList";
import { useAuth } from "../lib/AuthContext";
import { useLanguage } from "../lib/LanguageContext";
import { attributionHtml, chartHtml, escapeHtml, noticesHtml, patientHeaderHtml, printAsPdf } from "../lib/pdfExport";
import { PROVIDER_SHORT_LABELS, providerLabel } from "../lib/providerLabels";
import { stripMarkdownForSpeech, ttsSupported } from "../lib/tts";

const RANGES = [
  { hours: 6, label: "6h" },
  { hours: 24, label: "24h" },
  { hours: 72, label: "72h" },
  { hours: 168, label: "7d" },
  { hours: 2160, label: "3M" },
];

const DASHBOARD_CACHE_KEY = "glucosphere_last_dashboard";

function formatDelta(value: number | undefined, suffix = "%"): string {
  if (value === undefined || value === null) return "";
  const sign = value > 0 ? "+" : "";
  return ` (${sign}${value.toFixed(1)}${suffix})`;
}

function formatTime(ms: number, locale: string): string {
  return new Date(ms).toLocaleString(locale, { dateStyle: "short", timeStyle: "short" });
}

/** mg/dL is always what the backend computes/returns -- conversion for mmol/L users happens here,
 * display-only, so the API stays a single source of truth. */
function formatGlucose(mgDl: number, unit: "MG_DL" | "MMOL_L" | undefined): string {
  if (unit === "MMOL_L") return `${(mgDl / 18.0182).toFixed(1)} mmol/L`;
  return `${mgDl.toFixed(0)} mg/dL`;
}

function loadCachedDashboard(): Dashboard | null {
  try {
    const raw = localStorage.getItem(DASHBOARD_CACHE_KEY);
    return raw ? (JSON.parse(raw) as Dashboard) : null;
  } catch {
    return null;
  }
}

export default function OverviewPage() {
  const { t, language } = useLanguage();
  const { user, patientProfile, logout } = useAuth();
  const patientName = patientProfile ? [patientProfile.firstName, patientProfile.lastName].filter(Boolean).join(" ") : "";
  const locale = language === "DE" ? "de-DE" : "en-US";
  // Non-admin (family/care-team) accounts default to a short 3h window; admins keep the previous
  // 24h default. Both can still pick any other range via the chips below.
  const [rangeHours, setRangeHours] = useState(user?.role === "ADMIN" ? 24 : 3);
  // Shows the last successful result immediately (localStorage) instead of an empty/loading page
  // until the next explicit refresh completes -- a fresh fetch can take tens of seconds to
  // minutes for MCP-backed sources.
  const [dashboard, setDashboard] = useState<Dashboard | null>(loadCachedDashboard);
  const [loading, setLoading] = useState(dashboard === null);
  const [error, setError] = useState<string | null>(null);
  const [sources, setSources] = useState<DashboardSource[]>([]);
  const [selectedSourceIds, setSelectedSourceIds] = useState<Set<string>>(new Set());
  const [sourcesLoaded, setSourcesLoaded] = useState(false);

  const load = async (hours: number, sourceIds: Set<string>) => {
    setLoading(true);
    setError(null);
    try {
      const data = await api.getDashboard(hours, Array.from(sourceIds));
      setDashboard(data);
      try {
        localStorage.setItem(DASHBOARD_CACHE_KEY, JSON.stringify(data));
      } catch {
        // storage full/unavailable -- caching is a nice-to-have, never block on it
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    api.getDashboardSources().then((r) => {
      setSources(r.sources);
      setSelectedSourceIds(new Set(r.sources.map((s) => s.id)));
      setSourcesLoaded(true);
    });
  }, []);

  // Fetch once the initial source list is known -- but only if there's nothing cached to show yet
  // (first-ever visit), and NOT again just because the user changes the range or toggles a source
  // chip afterwards. Every fetch can take tens of seconds to minutes for MCP-backed sources (LLM
  // tool-calling round-trips), so re-fetching on every click/reload would be very wasteful; the
  // user must press "Aktualisieren" to fetch fresh data.
  useEffect(() => {
    if (!sourcesLoaded || dashboard !== null) return;
    load(rangeHours, selectedSourceIds);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sourcesLoaded]);

  const [filtersOpen, setFiltersOpen] = useState(false);
  // What the collapsed filter row shows, so the current selection never needs expanding to read.
  const filterSummary = [
    RANGES.find((r) => r.hours === rangeHours)?.label ?? `${rangeHours}h`,
    sources.filter((s) => selectedSourceIds.has(s.id)).map((s) => s.name).join(", "),
  ].filter(Boolean).join(" · ");

  const toggleSource = (id: string) => {
    setSelectedSourceIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  // Pull-to-refresh: only armed when already scrolled to the top, mirrors native app behavior.
  // Attached as a manual (non-passive) touchmove listener below -- React attaches its JSX
  // onTouchMove as passive by default, which silently makes preventDefault() a no-op and lets
  // the browser's own overscroll/bounce win the gesture. Barely noticeable with desktop dev-tools
  // touch emulation, but breaks the gesture on a real phone, especially as an installed standalone
  // PWA where the native bounce is more pronounced.
  const PULL_THRESHOLD = 70;
  const touchStartY = useRef<number | null>(null);
  const [pullDistance, setPullDistance] = useState(0);
  const contentRef = useRef<HTMLDivElement | null>(null);
  const loadingRef = useRef(loading);
  loadingRef.current = loading;
  const refreshRef = useRef(() => {});
  refreshRef.current = () => load(rangeHours, selectedSourceIds);

  useEffect(() => {
    const el = contentRef.current;
    if (!el) return;

    const onStart = (e: TouchEvent) => {
      if (window.scrollY <= 0 && !loadingRef.current) {
        touchStartY.current = e.touches[0].clientY;
      }
    };
    const onMove = (e: TouchEvent) => {
      if (touchStartY.current === null) return;
      const delta = e.touches[0].clientY - touchStartY.current;
      if (delta > 0 && window.scrollY <= 0) {
        e.preventDefault();
        setPullDistance(Math.min(delta, 120));
      } else {
        touchStartY.current = null;
        setPullDistance(0);
      }
    };
    const onEnd = () => {
      if (touchStartY.current === null) return;
      setPullDistance((current) => {
        if (current > PULL_THRESHOLD && !loadingRef.current) refreshRef.current();
        return 0;
      });
      touchStartY.current = null;
    };

    el.addEventListener("touchstart", onStart, { passive: true });
    el.addEventListener("touchmove", onMove, { passive: false });
    el.addEventListener("touchend", onEnd, { passive: true });
    return () => {
      el.removeEventListener("touchstart", onStart);
      el.removeEventListener("touchmove", onMove);
      el.removeEventListener("touchend", onEnd);
    };
  }, []);

  const [speakingSummary, setSpeakingSummary] = useState(false);
  useEffect(() => () => window.speechSynthesis?.cancel(), []);

  const toggleReadSummary = () => {
    if (!dashboard?.summaryText || !ttsSupported) return;
    if (speakingSummary) {
      window.speechSynthesis.cancel();
      setSpeakingSummary(false);
      return;
    }
    window.speechSynthesis.cancel();
    const fullText = [dashboard.summaryText, ...(dashboard.tips ?? [])].join(". ");
    const utterance = new SpeechSynthesisUtterance(stripMarkdownForSpeech(fullText));
    utterance.lang = locale;
    utterance.onend = () => setSpeakingSummary(false);
    utterance.onerror = () => setSpeakingSummary(false);
    window.speechSynthesis.speak(utterance);
    setSpeakingSummary(true);
  };

  const exportPdf = () => {
    if (!dashboard?.metrics) return;
    const m = dashboard.metrics;
    const rows: [string, string][] = [
      [t.overviewTir, `${m.tirPercent.toFixed(1)}%`],
      [t.overviewHypo, `${m.hypoPercent.toFixed(1)}%`],
      [t.overviewSevereHypo, `${m.severeHypoPercent.toFixed(1)}%`],
      [t.overviewHyper, `${m.hyperPercent.toFixed(1)}%`],
      [t.overviewVariability, `${m.cvPercent.toFixed(1)}%`],
      [t.overviewAvgGlucose, formatGlucose(m.avgGlucose, user?.glucoseUnit)],
      [t.overviewGmi, `${m.estimatedHbA1cPercent.toFixed(1)}%`],
    ];
    // Reihenfolge exakt wie auf dem Bildschirm und wie im Chat-Export: Inhalt, darunter die
    // Herkunftsangabe (Modell + Quellen), darunter die Hinweise zur Datenqualität.
    const body = `
      ${patientHeaderHtml(user, patientProfile, t)}
      <p>${escapeHtml(dashboard.statusReason ?? "")}</p>
      ${chartHtml(dashboard.series, locale, t.overviewChartTitle, dashboard.generatedAtMillis !== undefined
        // Same 24h window the backend caps the chart series to -- so the printed curve ends where
        // the data ends, exactly like on screen, instead of being stretched to the page width.
        ? { from: dashboard.generatedAtMillis - 24 * 60 * 60 * 1000, to: dashboard.generatedAtMillis }
        : undefined)}
      <h2>${escapeHtml(t.overviewMetricsTitle(dashboard.rangeLabel ?? ""))}</h2>
      <table>${rows.map(([label, value]) => `<tr><td>${escapeHtml(label)}</td><td>${escapeHtml(value)}</td></tr>`).join("")}</table>
      ${dashboard.summaryText ? `<h2>${escapeHtml(t.overviewSummaryTitle)}</h2><div class="content">${escapeHtml(dashboard.summaryText)}</div>` : ""}
      ${dashboard.tips && dashboard.tips.length > 0 ? `<ul>${dashboard.tips.map((tip) => `<li>${escapeHtml(tip)}</li>`).join("")}</ul>` : ""}
      ${attributionHtml(dashboard.narrativeProvider, dashboard.narrativeModel, dashboard.sourceNames, t, providerLabel)}
      ${noticesHtml((dashboard.dataGaps ?? []).map((gap) => gap.warningText))}
    `;
    printAsPdf(t.appTitle, body);
  };

  return (
    <div className="app-shell">
      <div className="topbar">
        <div>
          <h1>{t.appTitle}{patientName ? ` · ${patientName}` : ""}</h1>
        </div>
        <div className="topbar-actions">
          {/* Kein PDF-Symbol mehr hier oben -- der Export steht jetzt unter der Zusammenfassung,
              genau wie im Chat unter jeder Antwort. */}
          <button onClick={() => logout()} title={t.accountLogout}>
            <LogoutIcon />
          </button>
        </div>
      </div>
      <div className="content" ref={contentRef}>
        {pullDistance > 0 && (
          <div
            style={{
              textAlign: "center", height: pullDistance, display: "flex", alignItems: "center",
              justifyContent: "center", opacity: Math.min(pullDistance / PULL_THRESHOLD, 1), transition: "height 0.1s",
            }}
          >
            {pullDistance > PULL_THRESHOLD ? (
              <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                <RefreshIcon width={16} height={16} /> {t.overviewRefresh}
              </span>
            ) : (
              "↓"
            )}
          </div>
        )}
        {/* Oberer Teil: der wirklich live aktualisierte Wert samt 24h-Kurve. Eigener Endpunkt,
            eigener Takt (30s Wert / 15min Kurve), ohne LLM -- siehe LiveGlucoseTile.tsx. */}
        <LiveGlucoseTile glucoseUnit={user?.glucoseUnit} />

        {/* Unterer Teil: die Auswertung. Sie ist teuer (LLM + ggf. MCP-Quellen) und wird deshalb
            nur auf Knopfdruck neu gebaut -- Zeitraum, Quellen und "Aktualisieren" gehören hierher,
            nicht zum Live-Bereich darüber. Eingeklappt, weil beides selten geändert wird; die
            aktuelle Auswahl steht trotzdem immer in der Kopfzeile. */}
        <div className="card">
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <button
              type="button"
              className="filter-toggle"
              onClick={() => setFiltersOpen((v) => !v)}
              aria-expanded={filtersOpen}
            >
              {filtersOpen ? "▾" : "▸"} {t.overviewFiltersTitle}{" "}
              <span className="filter-summary">· {filterSummary}</span>
            </button>
            <button className="chip" onClick={() => load(rangeHours, selectedSourceIds)}>
              ⟳ {t.overviewRefresh}
            </button>
          </div>

          {filtersOpen && (
            <div style={{ marginTop: 12 }}>
              <label style={{ display: "block", fontSize: "0.85rem", color: "var(--text-muted)", marginBottom: 4 }}>
                {t.overviewRangeLabel}
              </label>
              <div className="range-chips">
                {RANGES.map((r) => (
                  <button
                    key={r.hours}
                    className={`chip ${rangeHours === r.hours ? "selected" : ""}`}
                    onClick={() => setRangeHours(r.hours)}
                  >
                    {r.label}
                  </button>
                ))}
              </div>
              {sources.length > 0 && (
                <div style={{ marginTop: 12 }}>
                  <label style={{ display: "block", fontSize: "0.85rem", color: "var(--text-muted)", marginBottom: 4 }}>
                    {t.overviewSourcesLabel}
                  </label>
                  <div className="range-chips">
                    {sources.map((s) => (
                      <button
                        key={s.id}
                        className={`chip ${selectedSourceIds.has(s.id) ? "selected" : ""}`}
                        onClick={() => toggleSource(s.id)}
                      >
                        {s.name}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {loading && dashboard === null && <div className="empty-state">{t.loading}</div>}
        {loading && dashboard !== null && (
          <div style={{ fontSize: "0.85rem", color: "var(--text-muted)", marginBottom: 12 }}>⟳ {t.overviewRefreshing}</div>
        )}
        {error && <div className="test-result error">{error}</div>}

        {dashboard && !dashboard.configured && (
          <div className="empty-state">
            {t.overviewNoDataSource}
            <br />
            <Link to="/settings/data-sources">{t.overviewSetUpNow}</Link>
          </div>
        )}

        {dashboard?.configured && dashboard.excluded && (
          <div className="empty-state">{t.overviewExcluded}</div>
        )}

        {dashboard?.configured && !dashboard.excluded && !dashboard.hasData && (
          <div className="empty-state">{t.overviewNoDataInRange(dashboard.rangeLabel ?? "")}</div>
        )}

        {dashboard?.configured && !dashboard.excluded && dashboard.hasData && dashboard.metrics && (
          <>
            {/* Kennzahlen des gewählten Zeitraums. Der aktuelle Wert steht bewusst NICHT mehr hier
                -- der lebt oben in der Live-Kachel; "Letzter Wert" ist hier der letzte Wert im
                ausgewerteten Fenster, was bei einem 7-Tage-Zeitraum etwas anderes ist. */}
            <div className="card">
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 10 }}>
                <h2 style={{ margin: 0 }}>{t.overviewMetricsTitle(dashboard.rangeLabel ?? "")}</h2>
                {dashboard.generatedAtMillis !== undefined && (
                  <span style={{ fontSize: "0.75rem", color: "var(--text-muted)", textAlign: "right", whiteSpace: "nowrap" }}>
                    {t.overviewLastUpdated(formatTime(dashboard.generatedAtMillis, locale))}
                    {dashboard.generationDurationMs !== undefined && ` · ⚡ ${(dashboard.generationDurationMs / 1000).toFixed(1)}s`}
                  </span>
                )}
              </div>
              {dashboard.combinedSourcesNote && (
                <p style={{ fontSize: "0.8rem", color: "var(--text-muted)", fontStyle: "italic" }}>
                  {dashboard.combinedSourcesNote}
                </p>
              )}
              {/* Ampel für den Zeitraum (Time in Range), klein und mittig -- die große Farbfläche
                  gehört der Live-Kachel, die etwas anderes aussagt ("gerade jetzt"). */}
              <div className={`status-light-wrap ${dashboard.status}`}>
                <span className="status-light" aria-hidden="true" />
                <p className="status-light-text">{dashboard.statusReason}</p>
              </div>
              <table className="metrics-table">
                <tbody>
                  <tr>
                    <td>{t.overviewTir}</td>
                    <td>
                      {dashboard.metrics.tirPercent.toFixed(1)}%
                      {formatDelta(dashboard.trend?.tirDelta)}
                    </td>
                  </tr>
                  <tr>
                    <td>{t.overviewHypo}</td>
                    <td>
                      {dashboard.metrics.hypoPercent.toFixed(1)}%
                      {formatDelta(dashboard.trend?.hypoDelta)}
                    </td>
                  </tr>
                  <tr>
                    <td>{t.overviewSevereHypo}</td>
                    <td>{dashboard.metrics.severeHypoPercent.toFixed(1)}%</td>
                  </tr>
                  <tr>
                    <td>{t.overviewHyper}</td>
                    <td>{dashboard.metrics.hyperPercent.toFixed(1)}%</td>
                  </tr>
                  <tr>
                    <td>{t.overviewVariability}</td>
                    <td>{dashboard.metrics.cvPercent.toFixed(1)}%</td>
                  </tr>
                  <tr>
                    <td>{t.overviewAvgGlucose}</td>
                    <td>
                      {formatGlucose(dashboard.metrics.avgGlucose, user?.glucoseUnit)}
                      {formatDelta(
                        user?.glucoseUnit === "MMOL_L" && dashboard.trend?.avgGlucoseDelta !== undefined
                          ? dashboard.trend.avgGlucoseDelta / 18.0182
                          : dashboard.trend?.avgGlucoseDelta,
                        user?.glucoseUnit === "MMOL_L" ? " mmol/L" : " mg/dL",
                      )}
                    </td>
                  </tr>
                  <tr>
                    <td>{t.overviewGmi}</td>
                    <td>{dashboard.metrics.estimatedHbA1cPercent.toFixed(1)}%</td>
                  </tr>
                  {dashboard.iobUnits != null && (
                    <tr>
                      <td>{t.overviewIob}</td>
                      <td>{dashboard.iobUnits.toFixed(2)} IE</td>
                    </tr>
                  )}
                  {dashboard.cobGrams != null && (
                    <tr>
                      <td>{t.overviewCob}</td>
                      <td>{dashboard.cobGrams.toFixed(0)} g</td>
                    </tr>
                  )}
                </tbody>
              </table>
              {dashboard.loopStatus && (
                <p style={{ fontSize: "0.8rem", color: "var(--text-muted)", marginTop: 8 }}>
                  {t.overviewLoopStatus}: {dashboard.loopStatus}
                </p>
              )}
            </div>

            {dashboard.narrativeFailed && (
              <p style={{ fontSize: "0.8rem", color: "var(--red-text)" }}>{t.overviewNarrativeFailed}</p>
            )}

            {dashboard.summaryText && (
              <div className="card">
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <h2 style={{ margin: 0 }}>{t.overviewSummaryTitle}</h2>
                  {ttsSupported && (
                    <button onClick={toggleReadSummary} title={t.overviewReadAloud}>
                      {speakingSummary ? <StopIcon width={18} height={18} /> : <SpeakerIcon width={18} height={18} />}
                    </button>
                  )}
                </div>
                <p>{dashboard.summaryText}</p>
                {dashboard.tips && dashboard.tips.length > 0 && (
                  <ul className="tips-list">
                    {dashboard.tips.map((tip, i) => (
                      <li key={i}>{tip}</li>
                    ))}
                  </ul>
                )}
              </div>
            )}

            {/* Export unter der Zusammenfassung, wie im Chat unter jeder Antwort -- dort gehört er
                zum Ergebnis, nicht in die Topbar zwischen Navigations-Symbole. */}
            <button
              onClick={exportPdf}
              style={{
                display: "inline-flex", alignItems: "center", gap: 4, marginBottom: 10,
                background: "none", border: "none", color: "var(--text-muted)", cursor: "pointer",
                padding: 0, fontSize: "0.75rem",
              }}
            >
              <DocumentIcon width={15} height={15} /> {t.overviewExportPdf}
            </button>

            {/* Attribution block: which model wrote the summary, and directly below it which data
                sources the numbers came from. Outside the summary card so the source line still
                shows when the AI narrative is switched off or failed -- where the data came from
                is worth stating regardless. */}
            {(dashboard.narrativeProvider || (dashboard.sourceNames?.length ?? 0) > 0) && (
              <p style={{ fontSize: "0.75rem", color: "var(--text-muted)", margin: "0 0 12px" }}>
                {dashboard.narrativeProvider && dashboard.narrativeModel && (
                  <>
                    {t.overviewAnalyzedWith(
                      PROVIDER_SHORT_LABELS[dashboard.narrativeProvider] ?? dashboard.narrativeProvider,
                      dashboard.narrativeModel,
                    )}
                    {(dashboard.sourceNames?.length ?? 0) > 0 && <br />}
                  </>
                )}
                {(dashboard.sourceNames?.length ?? 0) > 0 && t.analyzedSources(dashboard.sourceNames!.join(", "))}
              </p>
            )}

            {/* Below the summary, not above it: these qualify the result rather than replacing it.
                Rendered outside the summary card so they still appear when the AI narrative is
                switched off or failed -- a data gap matters regardless. */}
            <NoticeList notices={(dashboard.dataGaps ?? []).map((gap) => gap.warningText)} />
          </>
        )}
      </div>
    </div>
  );
}
