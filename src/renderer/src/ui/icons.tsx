import type { ReactNode, SVGProps } from 'react'

// Stroke icons drawn to match the design system. All are decorative; the control
// that holds one carries the label.

function Icon({ size = 24, viewBox = '0 0 36 36', children, ...rest }: IconProps & { viewBox?: string; children: ReactNode }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox={viewBox}
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...rest}
    >
      {children}
    </svg>
  )
}

type IconProps = { size?: number } & SVGProps<SVGSVGElement>

const CLOUD = 'M8 17a5 5 0 01.6-10 6.5 6.5 0 0112.4 2A4 4 0 0120 17z'

// Weather icons by the name used in content, drawn on a 28-unit grid.
const WEATHER_ICONS: Record<string, ReactNode> = {
  clear: (
    <>
      <circle cx="14" cy="14" r="5" />
      <path d="M14 3v3M14 22v3M3 14h3M22 14h3M6.200 6.200l2.100 2.100M19.700 19.700l2.100 2.100M6.200 21.800l2.100-2.100M19.700 8.300l2.100-2.100" />
    </>
  ),
  cloudy: <path d={CLOUD} transform="translate(0 2)" />,
  rain: (
    <>
      <path d={CLOUD} />
      <path d="M10 21l-1 3M14.500 21l-1 3M19 21l-1 3" />
    </>
  ),
  storm: (
    <>
      <path d={CLOUD} />
      <path d="M15 18l-3 4h4l-3 4" />
    </>
  ),
  snow: (
    <>
      <path d={CLOUD} />
      <path d="M10 22h.010M14 24h.010M18 22h.010M12 26h.010M16 26h.010" />
    </>
  ),
  fog: <path d="M4 9h20M7 14h17M4 19h18M9 24h13" />,
  wind: <path d="M3 11h13a3 3 0 10-3-3M3 16h18a3 3 0 11-3 3M3 21h8" />
}

/** The icon for a kind of weather. Unknown or missing kinds show a plain cloud. */
export const WeatherIcon = ({ kind, ...p }: IconProps & { kind?: string }) => (
  <Icon viewBox="0 0 28 28" {...p}>
    {WEATHER_ICONS[kind ?? ''] ?? WEATHER_ICONS['cloudy']}
  </Icon>
)

export const MarketIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M8 13h20l-1.5 17h-17z" />
    <path d="M13 16v-5a5 5 0 0110 0v5" />
  </Icon>
)

export const MapIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M18 32s-9-9.5-9-17a9 9 0 0118 0c0 7.5-9 17-9 17z" />
    <circle cx="18" cy="15" r="3.2" />
  </Icon>
)

export const NoticeBoardIcon = (p: IconProps) => (
  <Icon {...p}>
    <rect x="5" y="7" width="26" height="20" rx="1.5" />
    <path d="M10 27v4M26 27v4M10 13h8M10 18h6M22 12h5v7h-5z" />
  </Icon>
)

export const CalendarIcon = (p: IconProps) => (
  <Icon {...p}>
    <rect x="6" y="9" width="24" height="21" rx="2" />
    <path d="M6 16h24M12 5v7M24 5v7" />
  </Icon>
)

/** Three bars: the game's menu. */
export const MenuIcon = (p: IconProps) => (
  <Icon viewBox="0 0 20 18" strokeWidth={1.8} {...p}>
    <path d="M2 3h16M2 9h16M2 15h16" />
  </Icon>
)

export const LogIcon = (p: IconProps) => (
  <Icon viewBox="0 0 18 14" strokeWidth={1.8} {...p}>
    <path d="M1 2h16M1 7h16M1 12h10" />
  </Icon>
)

export const HideIcon = (p: IconProps) => (
  <Icon viewBox="0 0 18 14" strokeWidth={1.8} {...p}>
    <path d="M1 7s3-5.5 8-5.5S17 7 17 7s-3 5.5-8 5.5S1 7 1 7z" />
    <circle cx="9" cy="7" r="2.2" />
  </Icon>
)

export const CharacterIcon = (p: IconProps) => (
  <Icon viewBox="0 0 18 16" strokeWidth={1.8} {...p}>
    <circle cx="7" cy="4.5" r="3" />
    <path d="M1 15c0-3.300 2.700-5.500 6-5.500s6 2.200 6 5.500M13 2a3 3 0 010 5.500M15 10.500c1.300.9 2 2.500 2 4.500" />
  </Icon>
)

export const BackgroundIcon = (p: IconProps) => (
  <Icon viewBox="0 0 18 16" strokeWidth={1.8} {...p}>
    <rect x="1" y="1" width="16" height="14" rx="1.5" />
    <circle cx="6" cy="6" r="1.5" />
    <path d="M1 12l4.500-4 4 3.500 3-2.500L17 12" />
  </Icon>
)

export const ChevronIcon = (p: IconProps) => (
  <Icon viewBox="0 0 12 18" {...p}>
    <path d="M3 3l6 6-6 6" />
  </Icon>
)

// Item and stall icons, drawn on a 24-unit grid and looked up by the name used in content.
const ITEM_ICONS: Record<string, ReactNode> = {
  gift: (
    <>
      <rect x="4" y="10" width="16" height="10" rx="1" />
      <path d="M3 7h18v3H3zM12 7v13M12 7c-2-4-6-3-5 0M12 7c2-4 6-3 5 0" />
    </>
  ),
  flower: (
    <>
      <circle cx="12" cy="8" r="2" />
      <path d="M12 6V3M14 8h3M12 10v11M10 8H7M13.500 6.500l2-2M10.500 6.500l-2-2M12 16c-3 0-4-2-4-4M12 18c3 0 4-2 4-4" />
    </>
  ),
  plant: <path d="M7 21h10l-1-6H8zM12 15V8M12 11c-4 0-6-2-6-6 4 0 6 2 6 6zM12 9c3 0 5-2 5-5-3 0-5 2-5 5z" />,
  soap: (
    <>
      <rect x="4" y="12" width="16" height="8" rx="3" />
      <circle cx="8" cy="6" r="1.500" />
      <circle cx="13" cy="4" r="1" />
      <circle cx="16" cy="8" r="2" />
    </>
  ),
  sweet: <path d="M5 20h14l-1-8H6zM6 12c0-5 12-5 12 0M12 8V5M10 5h4" />,
  bottle: <path d="M10 3h4v4l3 4v9a1 1 0 01-1 1H8a1 1 0 01-1-1v-9l3-4zM7 14h10" />,
  salt: <path d="M12 12a4 4 0 100 8 4 4 0 000-8zM12 12c-6 0-7-8 0-8s6 8 0 8M8 9l8 0" />,
  book: <path d="M5 4h11a3 3 0 013 3v13H8a3 3 0 01-3-3zM5 17a3 3 0 013-3h11M9 8h6" />,
  map: <path d="M3 6l6-2 6 2 6-2v14l-6 2-6-2-6 2zM9 4v14M15 6v14" />,
  cards: (
    <>
      <rect x="4" y="5" width="10" height="14" rx="1.500" transform="rotate(-8 9 12)" />
      <rect x="10" y="5" width="10" height="14" rx="1.500" transform="rotate(8 15 12)" />
    </>
  ),
  ribbon: <path d="M12 9c-3-5-8-4-8 0s5 5 8 0zM12 9c3-5 8-4 8 0s-5 5-8 0zM10 11l-3 9 5-3 5 3-3-9" />,
  stone: <path d="M5 16c-2-5 2-10 8-9 6 1 8 6 5 10-3 3-11 3-13-1zM9 11c1-1 3-1 4 0" />,
  blade: <path d="M19 3l-9 9-2-2 9-9zM8 10l-4 4 6 6 4-4M5 19l-2 2" />,
  belt: (
    <>
      <path d="M3 9h18v6H3z" />
      <rect x="9" y="8" width="6" height="8" rx="1" />
      <path d="M12 12h4" />
    </>
  ),
  key: (
    <>
      <circle cx="7" cy="12" r="3.500" />
      <path d="M10.500 12H21M17 12v4M20 12v3" />
    </>
  ),
  vial: <path d="M9 3h6M10 3v7l-4 8a2 2 0 002 3h8a2 2 0 002-3l-4-8V3M8 15h8" />,
  necklace: (
    <>
      <path d="M5 4c0 8 3 11 7 11s7-3 7-11" />
      <path d="M12 15l-2 3 2 3 2-3z" />
    </>
  )
}

/** The icon for an item or stall. Unknown names fall back to a gift box. */
export function ItemIcon({ name, size = 28 }: { name: string; size?: number }) {
  return (
    <Icon size={size} viewBox="0 0 24 24" strokeWidth={1.6}>
      {ITEM_ICONS[name] ?? ITEM_ICONS['gift']}
    </Icon>
  )
}

/** Leaf divider: a pair of leaves between two rules. */
export function Sprig({ width = 180 }: { width?: number }) {
  const mid = width / 2
  return (
    <svg
      className="sprig"
      width={width}
      height={20}
      viewBox={`0 0 ${width} 20`}
      fill="none"
      stroke="currentColor"
      strokeWidth={1.4}
      strokeLinecap="round"
      aria-hidden="true"
    >
      <path d={`M0 10h${mid - 22}M${mid + 22} 10h${mid - 22}`} />
      <path
        d={`M${mid} 10c-5-8-14-8-17 0 3 8 12 8 17 0zM${mid} 10c5-8 14-8 17 0-3 8-12 8-17 0z`}
      />
      <path d={`M${mid - 12} 10h24`} />
    </svg>
  )
}

/** Vine corner ornament. `corner` picks which corner of its container it sits in. */
export function VineCorner({ corner }: { corner: 'tl' | 'tr' | 'bl' | 'br' }) {
  return (
    <svg
      className={`vine vine-${corner}`}
      width={72}
      height={72}
      viewBox="0 0 56 56"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.2}
      strokeLinecap="round"
      aria-hidden="true"
    >
      <path d="M4 52V20C4 11 11 4 20 4h32" />
      <path d="M4 30c7-1 10-5 9-11-6 0-9 5-9 11zM30 4c-1 7-5 10-11 9 0-6 5-9 11-9z" />
      <path d="M12 12c4 0 7 3 7 7" />
    </svg>
  )
}

// The phone's own icons, drawn on a 24-unit grid.

/** A cell phone: the player's own, with his DMs, Friends, the Bloomr feed and Jobs on it. */
export const VideoIcon = (p: IconProps) => (
  <Icon {...p}>
    <rect x="4" y="10" width="19" height="16" rx="2" />
    <path d="M23 16l9-5v14l-9-5z" />
  </Icon>
)

export const PhoneIcon = (p: IconProps) => (
  <Icon viewBox="0 0 24 24" {...p}>
    <rect x="6.5" y="2.5" width="11" height="19" rx="2.5" />
    <path d="M10.5 5.500h3M11 18.500h2" />
  </Icon>
)

export const ChatIcon = (p: IconProps) => (
  <Icon viewBox="0 0 24 24" {...p}>
    <path d="M21 11.500a8.400 8.400 0 01-12.300 7.400L3 21l2.100-5.700A8.400 8.400 0 1121 11.500z" />
  </Icon>
)

export const FriendsIcon = (p: IconProps) => (
  <Icon viewBox="0 0 24 24" {...p}>
    <circle cx="9" cy="7.500" r="3.500" />
    <path d="M2.500 20.500v-1.500a5 5 0 015-5h3a5 5 0 015 5v1.500M16 4.200a3.500 3.500 0 010 6.600M18.500 14.300a5 5 0 013 4.700v1.500" />
  </Icon>
)

export const FeedIcon = (p: IconProps) => (
  <Icon viewBox="0 0 24 24" {...p}>
    <path d="M4 11a9 9 0 019 9M4 4a16 16 0 0116 16" />
    <circle cx="5" cy="19" r="1.500" />
  </Icon>
)

export const WorkIcon = (p: IconProps) => (
  <Icon viewBox="0 0 24 24" {...p}>
    <rect x="3" y="7.500" width="18" height="12.500" rx="2" />
    <path d="M9 7.500V6a2 2 0 012-2h2a2 2 0 012 2v1.500M3 13h18" />
  </Icon>
)

/** A woman with child, seen from the side. */
export const PregnantIcon = (p: IconProps) => (
  <Icon viewBox="0 0 24 24" {...p}>
    <circle cx="10.500" cy="4.500" r="2.300" />
    <path d="M9.500 8.500c-1.400.700-2 2.200-2 4.200V21h5.500v-4.800c2.600 0 4.500-1.300 4.500-3.500 0-2.300-2-3.600-4.500-3.900-1.200-.400-2.400-.600-3.500-.300z" />
  </Icon>
)

export const HeartIcon = (p: IconProps) => (
  <Icon viewBox="0 0 24 24" {...p}>
    <path d="M12 20.500s-8-4.800-8-10.700A4.600 4.600 0 0112 7a4.600 4.600 0 018 2.800c0 5.900-8 10.700-8 10.700z" />
  </Icon>
)

export const BackIcon = (p: IconProps) => (
  <Icon viewBox="0 0 24 24" {...p}>
    <path d="M19 12H5M11 6l-6 6 6 6" />
  </Icon>
)

/**
 * The pictures a job can have beside it on the board, by the name its data gives: a cup for
 * the barista, a book for the library page. A job that names none, or one not drawn here,
 * gets the briefcase.
 */
export const JOB_ICON_PATHS: Record<string, string> = {
  crate: 'M3 8h18v12H3z M3 13h18 M9 8v12 M15 8v12',
  pot: 'M5 10h14v6a4 4 0 01-4 4H9a4 4 0 01-4-4z M3 10h18 M9 6c0-1 1-1 1-2 M14 6c0-1 1-1 1-2',
  bell: 'M5 17a7 7 0 0114 0z M3 19.500h18 M12 10V7 M10 7h4',
  bag: 'M5 8h14l-1 12H6z M9 8V6a3 3 0 016 0v2',
  ticket: 'M3 8h18v3a2 2 0 000 4v3H3v-3a2 2 0 000-4z M14 8v2 M14 12v2 M14 16v2',
  droplet: 'M12 3s6 6.500 6 11a6 6 0 01-12 0c0-4.500 6-11 6-11z',
  boba: 'M7 8h10l-1.500 12h-7z M5 8h14 M13 8l2-5 M10 16h.010 M13 17h.010 M11.500 14h.010',
  leaf: 'M5 19c0-9 5-14 14-14 0 9-5 14-14 14z M5 19l8-8',
  book: 'M4 5a2 2 0 012-2h13v16H6a2 2 0 00-2 2z M4 21V5 M9 7h6',
  gamepad: 'M7 8h10a4 4 0 014 4v2a3 3 0 01-5.500 1.500l-1-1.500h-5l-1 1.500A3 3 0 013 14v-2a4 4 0 014-4z M8 10v3 M6.500 11.500h3 M16 11h.010 M17.500 12.500h.010',
  coffee: 'M4 9h13v5a5 5 0 01-5 5H9a5 5 0 01-5-5z M17 10h1.500a2.500 2.500 0 010 5H17 M8 3c0 1.500 1 1.500 1 3 M12 3c0 1.500 1 1.500 1 3',
  sword: 'M20 4L10 14 M20 4h-5 M20 4v5 M7 13l4 4 M5 19l4-4 M4 20l1-1',
  glass: 'M6 4h12l-1 8a5 5 0 01-10 0z M12 17v4 M8 21h8',
  cross: 'M9 3h6v6h6v6h-6v6H9v-6H3V9h6z',
  dumbbell: 'M3 9v6 M6 6v12 M18 6v12 M21 9v6 M6 12h12',
  door: 'M6 21V4a1 1 0 011-1h10a1 1 0 011 1v17 M4 21h16 M14.500 12h.010',
  cloche: 'M4 17a8 8 0 0116 0z M2 19.500h20 M12 9V7.500 M12 6h.010',
  flask: 'M9 3h6 M10 3v6L5 19a1.500 1.500 0 001.300 2h11.400a1.500 1.500 0 001.300-2L14 9V3 M7.500 15h9',
  scroll: 'M7 4h11a2 2 0 010 4H7 M7 4a2 2 0 00-2 2v12a2 2 0 002 2h11a2 2 0 002-2V8 M9 12h7 M9 15h5',
  // Places.
  columns: 'M3 9l9-5 9 5 M5 9v9 M9.500 9v9 M14.500 9v9 M19 9v9 M3 20h18',
  cap: 'M2 9l10-5 10 5-10 5z M6 11.500V16c2 2 10 2 12 0v-4.500 M22 9v5',
  chapel: 'M12 3v4 M10 5h4 M6 21V12l6-5 6 5v9z M10 21v-4a2 2 0 014 0v4',
  bed: 'M3 18V7 M3 11h14a4 4 0 014 4v3 M3 15h18 M7 11V9.500a1.500 1.500 0 013 0V11',
  lantern: 'M9 3h6 M12 3v2 M8 5h8l1 3H7z M8 8v9a4 4 0 008 0V8 M12 11v4',
  house: 'M4 11l8-7 8 7 M6 10v10h12V10 M10 20v-5h4v5',
  music: 'M9 18V5l11-2v13 M9 18a3 3 0 11-6 0 3 3 0 016 0z M20 16a3 3 0 11-6 0 3 3 0 016 0z',
  tree: 'M12 21v-6 M12 15c-4 0-6-2.500-6-5a4 4 0 012.500-3.700A4 4 0 0116 5.500 4 4 0 0118 10c0 2.500-2 5-6 5z',
  pin: 'M12 21s7-6.500 7-12a7 7 0 10-14 0c0 5.500 7 12 7 12z M12 11.500a2.500 2.500 0 100-5 2.500 2.500 0 000 5z'
}

/** The names a job's data may give its picture. */
export const JOB_ICONS = Object.keys(JOB_ICON_PATHS)

export function JobIcon({ name, ...p }: IconProps & { name?: string }) {
  const path = name ? JOB_ICON_PATHS[name] : undefined
  if (!path) return <WorkIcon {...p} />
  return (
    <Icon viewBox="0 0 24 24" {...p}>
      <path d={path} />
    </Icon>
  )
}

/** The picture of a place on the map, by the name its data gives. One that names none, or one not drawn here, gets a map pin. */
export function PlaceIcon({ name, ...p }: IconProps & { name?: string }) {
  return (
    <Icon viewBox="0 0 24 24" {...p}>
      <path d={(name && JOB_ICON_PATHS[name]) || JOB_ICON_PATHS['pin']} />
    </Icon>
  )
}
