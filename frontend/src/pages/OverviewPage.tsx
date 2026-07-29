import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { api, type Dashboard, type DashboardSeriesPoint, type DashboardSource } from "../lib/api";
import { useAuth } from "../lib/AuthContext";
import { useLanguage } from "../lib/LanguageContext";
import { escapeHtml, patientHeaderHtml, printAsPdf } from "../lib/pdfExport";
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

function formatGlucoseValue(mgDl: number, unit: "MG_DL" | "MMOL_L" | undefined): string {
  return unit === "MMOL_L" ? (mgDl / 18.0182).toFixed(1) : mgDl.toFixed(0);
}

const SPARKLINE_W = 400;
const SPARKLINE_H = 140;

const TARGET_LOW_MGDL = 70;
const TARGET_HIGH_MGDL = 180;
const SPARKLINE_TICK_COUNT = 4;

interface SparklinePaths {
  line: string;
  area: string;
  lowY: number;
  highY: number;
  ticks: { pct: number; t: number }[];
}

/** Builds an SVG line+fill path for the glucose sparkline shown behind the status "Ampel", plus
 * target-range (70-180 mg/dL) reference-line Y positions and evenly spaced time-axis ticks. The
 * Y domain always includes 70-180 (not just the series' own min/max) so the reference lines stay
 * meaningful even when the trace never leaves the target range. */
function buildSparkline(series: DashboardSeriesPoint[] | undefined): SparklinePaths | null {
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

  const toggleSource = (id: string) => {
    setSelectedSourceIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const chartPaths = dashboard ? buildSparkline(dashboard.series) : null;

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
    const body = `
      ${patientHeaderHtml(user, patientProfile, t)}
      <p>${escapeHtml(dashboard.statusReason ?? "")}</p>
      <h2>${escapeHtml(t.overviewMetricsTitle(dashboard.rangeLabel ?? ""))}</h2>
      <table>${rows.map(([label, value]) => `<tr><td>${escapeHtml(label)}</td><td>${escapeHtml(value)}</td></tr>`).join("")}</table>
      ${dashboard.summaryText ? `<h2>${escapeHtml(t.overviewSummaryTitle)}</h2><div class="content">${escapeHtml(dashboard.summaryText)}</div>` : ""}
      ${dashboard.tips && dashboard.tips.length > 0 ? `<ul>${dashboard.tips.map((tip) => `<li>${escapeHtml(tip)}</li>`).join("")}</ul>` : ""}
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
          {dashboard?.metrics && (
            <button onClick={exportPdf} title={t.overviewExportPdf}>
              📄
            </button>
          )}
          <Link to="/settings">
            <button>⚙️</button>
          </Link>
          <button onClick={() => logout()} title={t.accountLogout}>
            🚪
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
            {pullDistance > PULL_THRESHOLD ? `🔄 ${t.overviewRefresh}` : "↓"}
          </div>
        )}
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
          <button className="chip" onClick={() => load(rangeHours, selectedSourceIds)}>
            ⟳ {t.overviewRefresh}
          </button>
        </div>

        {sources.length > 0 && (
          <div style={{ marginBottom: 16 }}>
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
            {dashboard.generatedAtMillis !== undefined && (
              <p style={{ fontSize: "0.8rem", color: "var(--text-muted)", textAlign: "right", margin: "0 0 6px" }}>
                {t.overviewLastUpdated(formatTime(dashboard.generatedAtMillis, locale))}
                {dashboard.generationDurationMs !== undefined && ` · ⚡ ${(dashboard.generationDurationMs / 1000).toFixed(1)}s`}
              </p>
            )}
            <div className={`status-banner ${dashboard.status}`}>
              {chartPaths && (
                <>
                  <svg
                    className="status-banner-chart"
                    viewBox={`0 0 ${SPARKLINE_W} ${SPARKLINE_H}`}
                    preserveAspectRatio="none"
                    aria-hidden="true"
                  >
                    <line x1="0" y1={chartPaths.highY} x2={SPARKLINE_W} y2={chartPaths.highY} stroke="currentColor" strokeOpacity="0.4" strokeWidth="1.5" strokeDasharray="6,4" />
                    <line x1="0" y1={chartPaths.lowY} x2={SPARKLINE_W} y2={chartPaths.lowY} stroke="currentColor" strokeOpacity="0.4" strokeWidth="1.5" strokeDasharray="6,4" />
                    <path d={chartPaths.area} fill="currentColor" fillOpacity="0.16" stroke="none" />
                    <path d={chartPaths.line} fill="none" stroke="currentColor" strokeOpacity="0.5" strokeWidth="2" />
                  </svg>
                  <div className="status-banner-axis" aria-hidden="true">
                    {chartPaths.ticks.map((tick, i) => (
                      <span
                        key={i}
                        style={{
                          position: "absolute",
                          left: `${tick.pct}%`,
                          transform: i === 0 ? "translateX(0)" : i === chartPaths.ticks.length - 1 ? "translateX(-100%)" : "translateX(-50%)",
                        }}
                      >
                        {new Date(tick.t).toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit" })}
                      </span>
                    ))}
                  </div>
                </>
              )}
              <div className="status-banner-content">
                <div className="dot">
                  {dashboard.latestValueMgDl !== undefined
                    ? `${formatGlucoseValue(dashboard.latestValueMgDl, user?.glucoseUnit)} ${dashboard.latestTrendArrow ?? ""}`
                    : `${dashboard.metrics.tirPercent.toFixed(0)}%`}
                </div>
                <div>{t.overviewTimeInRange(dashboard.metrics.tirPercent.toFixed(1))}</div>
              </div>
            </div>
            <div className="card">
              {dashboard.combinedSourcesNote && (
                <p style={{ fontSize: "0.8rem", color: "var(--text-muted)", fontStyle: "italic" }}>
                  {dashboard.combinedSourcesNote}
                </p>
              )}
              <p>{dashboard.statusReason}</p>
              {dashboard.latestValueMgDl !== undefined && (
                <p>
                  {t.overviewLastValue(formatGlucose(dashboard.latestValueMgDl, user?.glucoseUnit))} {dashboard.latestTrendArrow}
                </p>
              )}
              {dashboard.narrativeFailed && (
                <p style={{ fontSize: "0.8rem", color: "var(--red-text)" }}>{t.overviewNarrativeFailed}</p>
              )}
            </div>

            <div className="card">
              <h2>{t.overviewMetricsTitle(dashboard.rangeLabel ?? "")}</h2>
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

            {dashboard.dataGaps && dashboard.dataGaps.length > 0 && (
              <div className="test-result error" style={{ marginBottom: 16 }}>
                {dashboard.dataGaps.map((gap, i) => (
                  <p key={i} style={{ margin: i === 0 ? 0 : "8px 0 0" }}>
                    {gap.warningText}
                  </p>
                ))}
              </div>
            )}

            {dashboard.summaryText && (
              <div className="card">
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <h2 style={{ margin: 0 }}>{t.overviewSummaryTitle}</h2>
                  {ttsSupported && (
                    <button onClick={toggleReadSummary} title={t.overviewReadAloud}>
                      {speakingSummary ? "⏹️" : "🔊"}
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
          </>
        )}
      </div>
    </div>
  );
}
