/** Minimalist line icons for BottomNav -- hand-drawn from plain SVG primitives (rect/circle/line/
 * polyline only, no path/bezier data) so there's no risk of a malformed path silently failing to
 * render. `stroke="currentColor"` picks up the surrounding <a>'s `color` automatically, so the
 * existing `.bottom-nav a.active { color: var(--accent) }` rule re-colors the icon for free with
 * no extra CSS needed. */
import type { SVGProps } from "react";

function IconBase(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 24 24"
      width="22"
      height="22"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      {...props}
    />
  );
}

export function OverviewIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <IconBase {...props}>
      <polyline points="4,11 12,4 20,11" />
      <rect x="6" y="11" width="12" height="9" rx="1" />
      <rect x="10" y="15" width="4" height="5" />
    </IconBase>
  );
}

export function ChatIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <IconBase {...props}>
      <rect x="3" y="4" width="18" height="13" rx="3" />
      <polyline points="8,17 8,21 12,17" />
    </IconBase>
  );
}

export function SettingsIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <IconBase {...props}>
      <line x1="4" y1="6" x2="20" y2="6" />
      <circle cx="9" cy="6" r="2" />
      <line x1="4" y1="12" x2="20" y2="12" />
      <circle cx="15" cy="12" r="2" />
      <line x1="4" y1="18" x2="20" y2="18" />
      <circle cx="9" cy="18" r="2" />
    </IconBase>
  );
}
