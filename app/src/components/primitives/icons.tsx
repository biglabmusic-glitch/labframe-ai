import type { CSSProperties, ReactNode } from 'react';

interface IconProps {
  size?: number;
  color?: string;
  style?: CSSProperties;
}

function makeIcon(build: (c: string) => ReactNode) {
  return function Icon({ size = 18, color = 'currentColor', style }: IconProps) {
    return (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none" style={style}>
        {build(color)}
      </svg>
    );
  };
}

export const IconClose = makeIcon((c) => (
  <path d="M6 6l12 12M18 6L6 18" stroke={c} strokeWidth="1.8" strokeLinecap="round" />
));

export const IconBack = makeIcon((c) => (
  <path d="M14 6l-6 6 6 6" stroke={c} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
));

export const IconMore = makeIcon((c) => (
  <>
    <circle cx="5" cy="12" r="1.6" fill={c} />
    <circle cx="12" cy="12" r="1.6" fill={c} />
    <circle cx="19" cy="12" r="1.6" fill={c} />
  </>
));

export const IconPlus = makeIcon((c) => (
  <path d="M12 5v14M5 12h14" stroke={c} strokeWidth="1.8" strokeLinecap="round" />
));

export const IconArrow = makeIcon((c) => (
  <path d="M7 17L17 7M9 7h8v8" stroke={c} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
));

export const IconCheck = makeIcon((c) => (
  <path d="M5 12.5l4 4 10-10" stroke={c} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
));

export const IconSpark = makeIcon((c) => (
  <path d="M12 3l1.6 5.6L19 10l-5.4 1.4L12 17l-1.6-5.6L5 10l5.4-1.4L12 3z" fill={c} />
));

export const IconCam = makeIcon((c) => (
  <>
    <rect x="3" y="7" width="18" height="13" rx="3" stroke={c} strokeWidth="1.6" />
    <circle cx="12" cy="13.5" r="3.5" stroke={c} strokeWidth="1.6" />
    <path d="M9 7l1.2-2.5h3.6L15 7" stroke={c} strokeWidth="1.6" strokeLinejoin="round" />
  </>
));

export const IconImg = makeIcon((c) => (
  <>
    <rect x="3" y="4" width="18" height="16" rx="3" stroke={c} strokeWidth="1.6" />
    <circle cx="9" cy="10" r="1.8" fill={c} />
    <path d="M4 18l5-5 4 4 3-3 4 4" stroke={c} strokeWidth="1.6" strokeLinejoin="round" fill="none" />
  </>
));

export const IconHome = makeIcon((c) => (
  <path d="M4 11l8-7 8 7v8a2 2 0 01-2 2h-3v-6H9v6H6a2 2 0 01-2-2v-8z" stroke={c} strokeWidth="1.6" strokeLinejoin="round" />
));

export const IconGrid = makeIcon((c) => (
  <>
    <rect x="4" y="4" width="7" height="7" rx="1.5" stroke={c} strokeWidth="1.6" />
    <rect x="13" y="4" width="7" height="7" rx="1.5" stroke={c} strokeWidth="1.6" />
    <rect x="4" y="13" width="7" height="7" rx="1.5" stroke={c} strokeWidth="1.6" />
    <rect x="13" y="13" width="7" height="7" rx="1.5" stroke={c} strokeWidth="1.6" />
  </>
));

export const IconUser = makeIcon((c) => (
  <>
    <circle cx="12" cy="8.5" r="3.5" stroke={c} strokeWidth="1.6" />
    <path d="M5 20c1-3.5 4-5.5 7-5.5s6 2 7 5.5" stroke={c} strokeWidth="1.6" strokeLinecap="round" />
  </>
));

export const IconHistory = makeIcon((c) => (
  <>
    <circle cx="12" cy="12" r="8" stroke={c} strokeWidth="1.6" />
    <path d="M12 7v5l3 2" stroke={c} strokeWidth="1.6" strokeLinecap="round" />
  </>
));

export const IconDownload = makeIcon((c) => (
  <path
    d="M12 4v12m0 0l-4-4m4 4l4-4M5 20h14"
    stroke={c}
    strokeWidth="1.6"
    strokeLinecap="round"
    strokeLinejoin="round"
  />
));

export const IconShare = makeIcon((c) => (
  <>
    <circle cx="6" cy="12" r="2.4" stroke={c} strokeWidth="1.6" />
    <circle cx="18" cy="6" r="2.4" stroke={c} strokeWidth="1.6" />
    <circle cx="18" cy="18" r="2.4" stroke={c} strokeWidth="1.6" />
    <path d="M8.2 11l7.6-4M8.2 13l7.6 4" stroke={c} strokeWidth="1.6" />
  </>
));

export const IconRefresh = makeIcon((c) => (
  <path
    d="M4 12a8 8 0 0114-5.3L20 8M20 4v4h-4M20 12a8 8 0 01-14 5.3L4 16M4 20v-4h4"
    stroke={c}
    strokeWidth="1.6"
    strokeLinecap="round"
    strokeLinejoin="round"
    fill="none"
  />
));

export const IconEdit = makeIcon((c) => (
  <path d="M14 5l5 5L8 21H3v-5L14 5z" stroke={c} strokeWidth="1.6" strokeLinejoin="round" />
));

export const IconText = makeIcon((c) => (
  <path d="M6 5h12M12 5v14M9 19h6" stroke={c} strokeWidth="1.8" strokeLinecap="round" />
));

export const IconTooth = makeIcon((c) => (
  <path
    d="M7.5 3.5c-2 0-3.5 1.6-3.5 3.7 0 1.6.5 2.7 1 4 .6 1.7.5 3 .9 5.4.3 1.7 1 4.4 1.9 4.4 1 0 1-2 1.4-3.4.3-1.2.7-1.7 1.3-1.7s1 .5 1.3 1.7c.4 1.4.4 3.4 1.4 3.4.9 0 1.6-2.7 1.9-4.4.4-2.4.3-3.7.9-5.4.5-1.3 1-2.4 1-4 0-2.1-1.5-3.7-3.5-3.7-1.5 0-2.6.9-4 .9s-2.5-.9-4-.9z"
    stroke={c}
    strokeWidth="1.6"
    strokeLinejoin="round"
  />
));
