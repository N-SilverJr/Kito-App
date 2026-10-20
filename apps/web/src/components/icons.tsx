import type { SVGProps } from 'react';

export type IconName =
  | 'home'
  | 'search'
  | 'camera'
  | 'chart'
  | 'heart'
  | 'settings'
  | 'plus'
  | 'left'
  | 'right'
  | 'close'
  | 'check'
  | 'water'
  | 'scale'
  | 'timer'
  | 'sparkles'
  | 'user'
  | 'logout'
  | 'download'
  | 'trash'
  | 'edit'
  | 'alert'
  | 'info'
  | 'lock'
  | 'mail'
  | 'leaf'
  | 'calendar'
  | 'chevron'
  | 'sun'
  | 'moon'
  | 'monitor'
  | 'shopping'
  | 'refresh'
  | 'eye'
  | 'eyeOff'
  | 'plate'
  | 'flame'
  | 'arrowUp'
  | 'arrowDown'
  | 'bell';

const PATHS: Record<IconName, React.ReactNode> = {
  home: <><path d="M3.5 10.2 12 3.5l8.5 6.7V20a1 1 0 0 1-1 1h-5v-6h-5v6h-5a1 1 0 0 1-1-1z" /></>,
  search: <><circle cx="10.8" cy="10.8" r="6.8" /><path d="m16 16 4.5 4.5" /></>,
  camera: <><path d="M4 7.5h3l1.4-2.2h7.2L17 7.5h3a1 1 0 0 1 1 1V19a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V8.5a1 1 0 0 1 1-1Z" /><circle cx="12" cy="13" r="4" /></>,
  chart: <><path d="M4 20V10" /><path d="M10 20V4" /><path d="M16 20v-7" /><path d="M22 20H2" /></>,
  heart: <><path d="M12 20s-8-4.6-8-10a4.4 4.4 0 0 1 8-2.6A4.4 4.4 0 0 1 20 10c0 5.4-8 10-8 10Z" /></>,
  settings: <><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.9.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.9 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.9l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.9.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.9-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.9V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1Z" /></>,
  plus: <><path d="M12 5v14M5 12h14" /></>,
  left: <><path d="m15 5-7 7 7 7" /></>,
  right: <><path d="m9 5 7 7-7 7" /></>,
  close: <><path d="M6 6l12 12M18 6 6 18" /></>,
  check: <><path d="m4 12.5 5 5L20 6.5" /></>,
  water: <><path d="M12 2.8S5.5 9.7 5.5 14.2a6.5 6.5 0 0 0 13 0C18.5 9.7 12 2.8 12 2.8Z" /><path d="M9 14.5a3 3 0 0 0 3 3" /></>,
  scale: <><rect x="3" y="4" width="18" height="17" rx="3" /><path d="M8 9.5a4 4 0 0 1 8 0" /><path d="M12 9.5v2" /></>,
  timer: <><circle cx="12" cy="13" r="8" /><path d="M12 9v4l2.5 2.5" /><path d="M9 2h6" /></>,
  sparkles: <><path d="m12 3 1.7 4.8L18.5 9.5l-4.8 1.7L12 16l-1.7-4.8L5.5 9.5l4.8-1.7Z" /><path d="M18 15.5l.8 2.2 2.2.8-2.2.8-.8 2.2-.8-2.2-2.2-.8 2.2-.8Z" /></>,
  user: <><circle cx="12" cy="8" r="4" /><path d="M4 21c0-4 3.6-6.5 8-6.5s8 2.5 8 6.5" /></>,
  logout: <><path d="M15 4h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3" /><path d="M10 8 6 12l4 4" /><path d="M6 12h9" /></>,
  download: <><path d="M12 3v12" /><path d="m7 10 5 5 5-5" /><path d="M4 19h16" /></>,
  trash: <><path d="M4 7h16" /><path d="M9 7V4h6v3" /><path d="m6 7 1 13h10l1-13" /><path d="M10 11v5M14 11v5" /></>,
  edit: <><path d="M4 20h4l11-11a2.8 2.8 0 0 0-4-4L4 16z" /><path d="m13.5 6.5 4 4" /></>,
  alert: <><path d="M12 3 2.5 20h19Z" /><path d="M12 9v5" /><circle cx="12" cy="17.3" r="0.6" fill="currentColor" /></>,
  info: <><circle cx="12" cy="12" r="9" /><path d="M12 11v5" /><circle cx="12" cy="8" r="0.6" fill="currentColor" /></>,
  lock: <><rect x="4.5" y="10" width="15" height="11" rx="2.5" /><path d="M8 10V7a4 4 0 0 1 8 0v3" /></>,
  mail: <><rect x="3" y="5" width="18" height="14" rx="2.5" /><path d="m4 7 8 6 8-6" /></>,
  leaf: <><path d="M20 4C10 4 4 9 4 16c0 2 1 4 1 4s2-8 12-10" /><path d="M5 20c0-7 5-11 11-12" /></>,
  calendar: <><rect x="3" y="5" width="18" height="16" rx="2.5" /><path d="M8 3v4M16 3v4M3 10h18" /></>,
  chevron: <><path d="m9 5 7 7-7 7" /></>,
  sun: <><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M2 12h2M20 12h2M5 5l1.5 1.5M17.5 17.5 19 19M19 5l-1.5 1.5M6.5 17.5 5 19" /></>,
  moon: <><path d="M20 14.5A8.5 8.5 0 0 1 9.5 4a8.5 8.5 0 1 0 10.5 10.5Z" /></>,
  monitor: <><rect x="3" y="4" width="18" height="12" rx="2" /><path d="M9 20h6M12 16v4" /></>,
  shopping: <><path d="M4 5h2l2.4 10.5a2 2 0 0 0 2 1.5h6.6a2 2 0 0 0 2-1.5L21 8H7" /><circle cx="10" cy="20" r="1.2" /><circle cx="18" cy="20" r="1.2" /></>,
  refresh: <><path d="M20 12a8 8 0 1 1-2.3-5.7" /><path d="M20 4v5h-5" /></>,
  eye: <><path d="M2 12s3.6-6 10-6 10 6 10 6-3.6 6-10 6-10-6-10-6Z" /><circle cx="12" cy="12" r="2.8" /></>,
  eyeOff: <><path d="m3 3 18 18" /><path d="M10.6 6.2A10 10 0 0 1 12 6c6.4 0 10 6 10 6a17 17 0 0 1-2.2 2.7" /><path d="M6.5 7.6A17 17 0 0 0 2 12s3.6 6 10 6a9 9 0 0 0 3.3-.6" /></>,
  plate: <><circle cx="12" cy="12" r="8.5" /><circle cx="12" cy="12" r="4.5" /></>,
  flame: <><path d="M12 21c4 0 6.5-2.6 6.5-6 0-4.5-4-6.5-4-10.5-2 1.5-3 3.5-3 5.5-1-1-1.5-2-1.5-3.5C7 9 5.5 11.5 5.5 15c0 3.4 2.5 6 6.5 6Z" /></>,
  arrowUp: <><path d="M12 20V5M6 11l6-6 6 6" /></>,
  arrowDown: <><path d="M12 4v15M6 13l6 6 6-6" /></>,
  bell: <><path d="M18 9a6 6 0 0 0-12 0c0 5-2 6-2 6h16s-2-1-2-6" /><path d="M10 20a2.2 2.2 0 0 0 4 0" /></>,
};

export function Icon({
  name,
  size = 20,
  strokeWidth = 1.8,
  ...props
}: { name: IconName; size?: number; strokeWidth?: number } & SVGProps<SVGSVGElement>) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      {...props}
    >
      {PATHS[name]}
    </svg>
  );
}
