import { useLanguage } from "../lib/LanguageContext";

/** Data-quality warnings ("⚠️ Hinweis: In der Quelle ... fehlen Daten ...") shown UNDER the thing
 * they qualify -- the dashboard summary or a chat answer -- never above it, so they read as a
 * footnote to the result rather than as a page-level error.
 *
 * A single notice renders plainly (collapsing one line behind a disclosure would only hide it);
 * two or more collapse into a `<details>` so a source with many gaps can't push the actual answer
 * off screen. Backend-side these come from nightscout.NOTICE_PREFIX lines lifted out of the tool
 * results (see main.py::_extract_notices) -- they are also still passed to the model inline, so
 * this display is a guarantee, not the only path. */
export default function NoticeList({ notices }: { notices: string[] }) {
  const { t } = useLanguage();
  if (!notices || notices.length === 0) return null;

  if (notices.length === 1) {
    return <div className="notice-box">{notices[0]}</div>;
  }

  return (
    <details className="notice-box notice-box-collapsible">
      <summary>{t.noticesSummary(notices.length)}</summary>
      <ul>
        {notices.map((notice, i) => (
          <li key={i}>{notice}</li>
        ))}
      </ul>
    </details>
  );
}
