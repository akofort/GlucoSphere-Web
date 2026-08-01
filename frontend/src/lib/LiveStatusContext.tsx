import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { api, type DashboardSeriesPoint, type LiveStatus } from "./api";
import { useAuth } from "./AuthContext";

/** Poll intervals: the value is what people actually watch, the curve barely changes minute to
 * minute -- and each curve fetch pulls 24h of entries, so it runs far less often. Both hit
 * /api/live-status, which never involves an LLM. */
const VALUE_REFRESH_MS = 30_000;
const SERIES_REFRESH_MS = 15 * 60_000;
/** A CGM delivers every ~5 minutes; past this the "current" value is not current any more, and
 * both the tile and the tab title say so instead of presenting a stale number as live. */
export const STALE_AFTER_MS = 15 * 60_000;
/** A deliberately chosen delayed source (Glooko syncs through the pump/app, often hours behind) is
 * expected to be old -- flagging it after 15 minutes would mean permanently. */
export const STALE_AFTER_MS_DELAYED = 3 * 60 * 60_000;

export function staleThresholdFor(status: { delayed?: boolean } | null): number {
  return status?.delayed ? STALE_AFTER_MS_DELAYED : STALE_AFTER_MS;
}

interface LiveStatusValue {
  status: LiveStatus | null;
  /** True when the last poll failed -- the previous value stays on screen, flagged rather than
   * replaced by an error, since a single failed poll says nothing about the data itself. */
  failed: boolean;
}

const LiveStatusContext = createContext<LiveStatusValue>({ status: null, failed: false });

export function useLiveStatus(): LiveStatusValue {
  return useContext(LiveStatusContext);
}

/** One poller for the whole app. Lives above the router (see App.tsx) for two reasons: the
 * Übersicht tile and the browser-tab title must not each open their own polling loop, and the tab
 * title has to keep updating while the user is on the Chat or Settings page. */
export function LiveStatusProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<LiveStatus | null>(null);
  const [failed, setFailed] = useState(false);
  const seriesRef = useRef<DashboardSeriesPoint[] | undefined>(undefined);

  const load = useCallback(async (withSeries: boolean) => {
    try {
      const result = await api.getLiveStatus(withSeries);
      if (withSeries) {
        seriesRef.current = result.series;
      } else if (seriesRef.current) {
        // A value-only poll returns no curve -- keep the last one instead of blanking the chart.
        result.series = seriesRef.current;
      }
      setStatus(result);
      setFailed(false);
    } catch {
      setFailed(true);
    }
  }, []);

  useEffect(() => {
    load(true);
    // The VALUE poll deliberately keeps running in a hidden tab: the whole point of the tab title
    // is being readable while the user is looking at something else, so pausing it there would
    // defeat the feature. The SERIES poll (24h of entries) does pause -- nobody can see a chart in
    // a hidden tab -- and catches up on return.
    const valueTimer = window.setInterval(() => load(false), VALUE_REFRESH_MS);
    const seriesTimer = window.setInterval(() => {
      if (document.visibilityState === "visible") load(true);
    }, SERIES_REFRESH_MS);
    const onVisible = () => {
      if (document.visibilityState === "visible") load(true);
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.clearInterval(valueTimer);
      window.clearInterval(seriesTimer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [load]);

  useLiveDocumentTitle(status);

  return <LiveStatusContext.Provider value={{ status, failed }}>{children}</LiveStatusContext.Provider>;
}

const BASE_TITLE = "GlucoSphere";

/** The browser-tab label, the way Nightscout does it: "120 ↗ · GlucoSphere". Pure so it can be
 * tested without a DOM.
 *
 * A stale reading is marked (⚠) rather than dropped -- an unchanging number in the tab strip would
 * otherwise read as a flat trend instead of a stopped feed, which is the more dangerous
 * misreading of the two. */
export function liveDocumentTitle(status: LiveStatus | null, unit: "MG_DL" | "MMOL_L" | undefined, now = Date.now()): string {
  if (!status?.hasData || status.latestValueMgDl === undefined) return BASE_TITLE;
  const value = unit === "MMOL_L"
    ? (status.latestValueMgDl / 18.0182).toFixed(1)
    : status.latestValueMgDl.toFixed(0);
  const arrow = status.latestTrendArrow ?? "";
  const stale = now - (status.latestTimestampMillis ?? 0) > staleThresholdFor(status);
  return `${stale ? "⚠ " : ""}${value} ${arrow} · ${BASE_TITLE}`.replace(/\s+/g, " ").trim();
}

/** Puts the current value and trend into the browser tab -- so the tab strip alone answers "where
 * am I right now" without switching to the app. Restores the plain title on unmount. */
function useLiveDocumentTitle(status: LiveStatus | null) {
  const { user } = useAuth();
  const unit = user?.glucoseUnit;

  useEffect(() => {
    document.title = liveDocumentTitle(status, unit);
  }, [status, unit]);

  useEffect(() => () => {
    document.title = BASE_TITLE;
  }, []);
}
