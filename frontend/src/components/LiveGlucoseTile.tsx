import { useEffect, useState } from "react";
import { buildSparkline, SPARKLINE_H, SPARKLINE_W } from "../lib/sparkline";
import { useLanguage } from "../lib/LanguageContext";
import { staleThresholdFor, useLiveStatus } from "../lib/LiveStatusContext";

/** Nightscout direction strings -> how strongly the value is moving. Used to shift the color band
 * when the trend is heading for a limit (see liveBand). */
const FALLING_FAST = ["SingleDown", "DoubleDown"];
const RISING_FAST = ["SingleUp", "DoubleUp"];
const TARGET_LOW_MGDL = 70;
const TARGET_HIGH_MGDL = 180;

export type LiveBand = "SEVERE_LOW" | "LOW" | "IN_RANGE" | "HIGH" | "VERY_HIGH";

/** Background band for the tile. The value decides the band; a fast trend toward a limit pulls it
 * one step early, so "98 mg/dL, falling fast" warns before it is actually low rather than after --
 * which is the whole point of showing a trend next to a number. */
export function liveBand(mgDl: number, direction: string | undefined): LiveBand {
  if (mgDl < 54) return "SEVERE_LOW";
  if (mgDl < TARGET_LOW_MGDL) return "LOW";
  if (mgDl > 250) return "VERY_HIGH";
  if (mgDl > TARGET_HIGH_MGDL) return "HIGH";
  if (direction && FALLING_FAST.includes(direction) && mgDl < 100) return "LOW";
  if (direction && RISING_FAST.includes(direction) && mgDl > 150) return "HIGH";
  return "IN_RANGE";
}

function formatValue(mgDl: number, unit: "MG_DL" | "MMOL_L" | undefined): string {
  return unit === "MMOL_L" ? (mgDl / 18.0182).toFixed(1) : mgDl.toFixed(0);
}

interface Props {
  glucoseUnit: "MG_DL" | "MMOL_L" | undefined;
}

/** Top half of the Übersicht: the actually-live part. Separate from the analysis below because it
 * has completely different economics -- realtime REST sources only, no LLM, no metrics, so it can
 * refresh itself on a timer instead of waiting for a minutes-long dashboard build. */
export default function LiveGlucoseTile({ glucoseUnit }: Props) {
  const { t, language } = useLanguage();
  const locale = language === "DE" ? "de-DE" : "en-US";
  // Polling lives in LiveStatusContext, one loop for the whole app -- the browser-tab title needs
  // the same data on pages where this tile isn't mounted at all.
  const { status, failed } = useLiveStatus();
  // Re-renders once a minute so the "vor X Min." label ages even when no new data arrives.
  const [, setTick] = useState(0);
  useEffect(() => {
    const ageTimer = window.setInterval(() => setTick((n) => n + 1), 60_000);
    return () => window.clearInterval(ageTimer);
  }, []);

  if (status && !status.configured) {
    return (
      <div className="card" style={{ marginBottom: 16 }}>
        <p style={{ fontSize: "0.85rem", color: "var(--text-muted)", margin: 0 }}>{t.liveNoRealtimeSource}</p>
      </div>
    );
  }
  if (!status) {
    return <div className="empty-state">{t.loading}</div>;
  }
  if (!status.hasData || status.latestValueMgDl === undefined) {
    return (
      <div className="card" style={{ marginBottom: 16 }}>
        <p style={{ fontSize: "0.85rem", color: "var(--text-muted)", margin: 0 }}>{t.liveNoData}</p>
      </div>
    );
  }

  // X axis spans the requested window (server clock, so a wrong client clock can't shift the
  // curve), NOT the data range -- that is what makes the line visibly stop where the source's data
  // stops instead of always reaching the right edge.
  const windowEnd = status.generatedAtMillis ?? Date.now();
  const windowHours = status.rangeHours ?? 24;
  const chart = buildSparkline(status.series, {
    from: windowEnd - windowHours * 60 * 60_000,
    to: windowEnd,
  });
  const band = liveBand(status.latestValueMgDl, status.latestDirection);
  const readingAt = status.latestTimestampMillis ?? 0;
  const ageMinutes = Math.max(0, Math.round((Date.now() - readingAt) / 60_000));
  const stale = Date.now() - readingAt > staleThresholdFor(status);

  return (
    <>
    <div className={`live-tile ${band}${stale ? " stale" : ""}`}>
      {/* Stand oben links IN der Grafik: es gehört zum Wert, nicht unter ihn -- und der Platz über
          der Kurve ist ohnehin frei. */}
      <div className="live-asof">
        {t.liveAsOf(new Date(readingAt).toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit" }), ageMinutes)}
        {stale && ` · ${t.liveStale}`}
        {failed && ` · ${t.liveOffline}`}
      </div>
      {chart && (
        <>
          <svg className="status-banner-chart" viewBox={`0 0 ${SPARKLINE_W} ${SPARKLINE_H}`} preserveAspectRatio="none" aria-hidden="true">
            <line x1="0" y1={chart.highY} x2={SPARKLINE_W} y2={chart.highY} stroke="currentColor" strokeOpacity="0.4" strokeWidth="1.5" strokeDasharray="6,4" />
            <line x1="0" y1={chart.lowY} x2={SPARKLINE_W} y2={chart.lowY} stroke="currentColor" strokeOpacity="0.4" strokeWidth="1.5" strokeDasharray="6,4" />
            <path d={chart.area} fill="currentColor" fillOpacity="0.16" stroke="none" />
            <path d={chart.line} fill="none" stroke="currentColor" strokeOpacity="0.55" strokeWidth="2" />
          </svg>
          {/* Endpunkt-Markierung: macht aus "die Linie hört hier auf" eine bewusste Aussage statt
              eines abgeschnitten wirkenden Verlaufs. Als HTML-Element und nicht als <circle>, weil
              das SVG mit preserveAspectRatio="none" verzerrt skaliert -- ein Kreis darin wäre eine
              Ellipse. */}
          <span
            className="live-last-point"
            aria-hidden="true"
            style={{ left: `${(chart.lastX / SPARKLINE_W) * 100}%`, top: `${(chart.lastY / SPARKLINE_H) * 100}%` }}
          />
          <div className="status-banner-axis" aria-hidden="true">
            {chart.ticks.map((tick, i) => (
              <span
                key={i}
                style={{
                  position: "absolute",
                  left: `${tick.pct}%`,
                  transform: i === 0 ? "translateX(0)" : i === chart.ticks.length - 1 ? "translateX(-100%)" : "translateX(-50%)",
                }}
              >
                {new Date(tick.t).toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit" })}
              </span>
            ))}
          </div>
        </>
      )}
      <div className="status-banner-content">
        <div className="live-value">
          {formatValue(status.latestValueMgDl, glucoseUnit)}
          <span className="live-arrow">{status.latestTrendArrow}</span>
        </div>
        <div className="live-unit">{glucoseUnit === "MMOL_L" ? "mmol/L" : "mg/dL"}</div>
      </div>
    </div>
    {/* Fußzeile unter der Grafik: links was die Kachel zeigt, rechts woher es kommt. */}
    <div className="live-footnote">
      <span>{t.liveTileCaption}</span>
      <span>{status.sourceNames && status.sourceNames.length > 0 ? t.analyzedSources(status.sourceNames.join(", ")) : ""}</span>
    </div>
    </>
  );
}
