import { useState, type ReactNode } from "react";
import { STRINGS } from "../lib/strings";

const STORAGE_KEY = "glucosphere_disclaimer_accepted_at";
const REACCEPT_INTERVAL_MS = 24 * 60 * 60 * 1000;

function wasRecentlyAccepted(): boolean {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return false;
  const acceptedAt = Number(raw);
  return Number.isFinite(acceptedAt) && Date.now() - acceptedAt < REACCEPT_INTERVAL_MS;
}

/** Shown before any app content renders, at most once every 24h (persisted in localStorage) --
 * showing it on every single page load/reload turned out to be too intrusive in practice. Shown
 * in both German and English at once regardless of the user's chosen appLanguage -- this is a
 * legal disclaimer, not a translatable UI string. */
export default function DisclaimerGate({ children }: { children: ReactNode }) {
  const [accepted, setAccepted] = useState(wasRecentlyAccepted);
  if (accepted) return <>{children}</>;

  const accept = () => {
    localStorage.setItem(STORAGE_KEY, String(Date.now()));
    setAccepted(true);
  };

  return (
    <div className="app-shell">
      <div className="content" style={{ maxWidth: 640, margin: "0 auto" }}>
        <div className="card">
          <h2>{STRINGS.DE.aboutDisclaimerTitle}</h2>
          <p>{STRINGS.DE.aboutDisclaimerText}</p>
          <hr />
          <h2>{STRINGS.EN.aboutDisclaimerTitle}</h2>
          <p>{STRINGS.EN.aboutDisclaimerText}</p>
          <div className="btn-row" style={{ marginTop: 16 }}>
            <button className="btn primary" onClick={accept}>
              Verstanden / Understood
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
