/** The app's single icon set -- minimalist line icons in the style established for BottomNav,
 * hand-drawn mostly from plain SVG primitives (rect/circle/line/polyline/polygon) so there's no
 * risk of a malformed path silently failing to render. A handful (SpeakerIcon's sound waves,
 * RefreshIcon's arrows) need one simple circular-arc path each -- there's no primitive-only way
 * to draw a curve -- kept to a single `A`/`a` command per path and double-checked against the
 * circle's actual center/radius so the arc endpoints are exact, not guessed.
 *
 * `stroke="currentColor"` picks up the surrounding element's `color`, so existing color rules
 * (e.g. `.bottom-nav a.active`, `.topbar-actions button`) re-color every icon here for free.
 */
import type { SVGProps } from "react";

function IconBase(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 24 24"
      width="20"
      height="20"
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

export function DocumentIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <IconBase {...props}>
      <rect x="6" y="3" width="12" height="18" rx="1.5" />
      <line x1="9" y1="9" x2="15" y2="9" />
      <line x1="9" y1="13" x2="15" y2="13" />
      <line x1="9" y1="17" x2="13" y2="17" />
    </IconBase>
  );
}

export function LogoutIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <IconBase {...props}>
      <rect x="4" y="4" width="10" height="16" rx="1.5" />
      <line x1="10" y1="12" x2="21" y2="12" />
      <polyline points="17,8 21,12 17,16" />
    </IconBase>
  );
}

export function TrashIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <IconBase {...props}>
      <line x1="4" y1="7" x2="20" y2="7" />
      <rect x="6" y="7" width="12" height="13" rx="1" />
      <rect x="9" y="3.5" width="6" height="3.5" rx="1" />
      <line x1="10" y1="11" x2="10" y2="16" />
      <line x1="14" y1="11" x2="14" y2="16" />
    </IconBase>
  );
}

export function ClockIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <IconBase {...props}>
      <circle cx="12" cy="12" r="8.5" />
      <polyline points="12,7.5 12,12 15.5,14" />
    </IconBase>
  );
}

export function PencilIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <IconBase {...props}>
      <polygon points="4,20 4.8,16.2 15.5,5.5 18.5,8.5 7.8,19.2 4,20" />
      <line x1="13" y1="8" x2="16" y2="11" />
    </IconBase>
  );
}

export function SpeakerIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <IconBase {...props}>
      <polygon points="4,9 8,9 13,4.5 13,19.5 8,15 4,15" />
      <path d="M16 8.5a5 5 0 0 1 0 7" />
      <path d="M19 6a8.5 8.5 0 0 1 0 12" />
    </IconBase>
  );
}

/** Solid (filled, not outlined) square -- the conventional "stop" glyph, reused for both
 * "stop reading aloud" and "stop generating" (same action conceptually: stop the thing in
 * progress). */
export function StopIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <IconBase fill="currentColor" stroke="none" {...props}>
      <rect x="6.5" y="6.5" width="11" height="11" rx="1.5" />
    </IconBase>
  );
}

export function RefreshIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <IconBase {...props}>
      <path d="M4.5 12A7.5 7.5 0 0 1 12 4.5" />
      <polyline points="9,4.9 12,4.5 12.8,7.5" />
      <path d="M19.5 12A7.5 7.5 0 0 1 12 19.5" />
      <polyline points="15,19.1 12,19.5 11.2,16.5" />
    </IconBase>
  );
}
