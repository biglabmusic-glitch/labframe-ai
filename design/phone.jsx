// phone.jsx — phone frame for LabFrame AI mini-app screens + UI primitives

const PHONE_W = 360;
const PHONE_H = 760;

// ─── Icons (very simple, geometric, no AI-slop) ─────────────────
const I = {
  close: (s=18,c='currentColor') => (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none">
      <path d="M6 6l12 12M18 6L6 18" stroke={c} strokeWidth="1.8" strokeLinecap="round"/>
    </svg>
  ),
  back: (s=18,c='currentColor') => (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none">
      <path d="M14 6l-6 6 6 6" stroke={c} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  ),
  more: (s=18,c='currentColor') => (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none">
      <circle cx="5" cy="12" r="1.6" fill={c}/>
      <circle cx="12" cy="12" r="1.6" fill={c}/>
      <circle cx="19" cy="12" r="1.6" fill={c}/>
    </svg>
  ),
  plus: (s=18,c='currentColor') => (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none">
      <path d="M12 5v14M5 12h14" stroke={c} strokeWidth="1.8" strokeLinecap="round"/>
    </svg>
  ),
  arrow: (s=18,c='currentColor') => (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none">
      <path d="M7 17L17 7M9 7h8v8" stroke={c} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  ),
  check: (s=18,c='currentColor') => (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none">
      <path d="M5 12.5l4 4 10-10" stroke={c} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  ),
  spark: (s=16,c='currentColor') => (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none">
      <path d="M12 3l1.6 5.6L19 10l-5.4 1.4L12 17l-1.6-5.6L5 10l5.4-1.4L12 3z" fill={c}/>
    </svg>
  ),
  cam: (s=18,c='currentColor') => (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none">
      <rect x="3" y="7" width="18" height="13" rx="3" stroke={c} strokeWidth="1.6"/>
      <circle cx="12" cy="13.5" r="3.5" stroke={c} strokeWidth="1.6"/>
      <path d="M9 7l1.2-2.5h3.6L15 7" stroke={c} strokeWidth="1.6" strokeLinejoin="round"/>
    </svg>
  ),
  img: (s=18,c='currentColor') => (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none">
      <rect x="3" y="4" width="18" height="16" rx="3" stroke={c} strokeWidth="1.6"/>
      <circle cx="9" cy="10" r="1.8" fill={c}/>
      <path d="M4 18l5-5 4 4 3-3 4 4" stroke={c} strokeWidth="1.6" strokeLinejoin="round" fill="none"/>
    </svg>
  ),
  home: (s=18,c='currentColor') => (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none">
      <path d="M4 11l8-7 8 7v8a2 2 0 01-2 2h-3v-6H9v6H6a2 2 0 01-2-2v-8z" stroke={c} strokeWidth="1.6" strokeLinejoin="round"/>
    </svg>
  ),
  grid: (s=18,c='currentColor') => (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none">
      <rect x="4" y="4" width="7" height="7" rx="1.5" stroke={c} strokeWidth="1.6"/>
      <rect x="13" y="4" width="7" height="7" rx="1.5" stroke={c} strokeWidth="1.6"/>
      <rect x="4" y="13" width="7" height="7" rx="1.5" stroke={c} strokeWidth="1.6"/>
      <rect x="13" y="13" width="7" height="7" rx="1.5" stroke={c} strokeWidth="1.6"/>
    </svg>
  ),
  user: (s=18,c='currentColor') => (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none">
      <circle cx="12" cy="8.5" r="3.5" stroke={c} strokeWidth="1.6"/>
      <path d="M5 20c1-3.5 4-5.5 7-5.5s6 2 7 5.5" stroke={c} strokeWidth="1.6" strokeLinecap="round"/>
    </svg>
  ),
  history: (s=18,c='currentColor') => (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none">
      <circle cx="12" cy="12" r="8" stroke={c} strokeWidth="1.6"/>
      <path d="M12 7v5l3 2" stroke={c} strokeWidth="1.6" strokeLinecap="round"/>
    </svg>
  ),
  download: (s=18,c='currentColor') => (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none">
      <path d="M12 4v12m0 0l-4-4m4 4l4-4M5 20h14" stroke={c} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  ),
  share: (s=18,c='currentColor') => (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none">
      <circle cx="6" cy="12" r="2.4" stroke={c} strokeWidth="1.6"/>
      <circle cx="18" cy="6" r="2.4" stroke={c} strokeWidth="1.6"/>
      <circle cx="18" cy="18" r="2.4" stroke={c} strokeWidth="1.6"/>
      <path d="M8.2 11l7.6-4M8.2 13l7.6 4" stroke={c} strokeWidth="1.6"/>
    </svg>
  ),
  refresh: (s=18,c='currentColor') => (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none">
      <path d="M4 12a8 8 0 0114-5.3L20 8M20 4v4h-4M20 12a8 8 0 01-14 5.3L4 16M4 20v-4h4" stroke={c} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
    </svg>
  ),
  edit: (s=16,c='currentColor') => (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none">
      <path d="M14 5l5 5L8 21H3v-5L14 5z" stroke={c} strokeWidth="1.6" strokeLinejoin="round"/>
    </svg>
  ),
  text: (s=18,c='currentColor') => (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none">
      <path d="M6 5h12M12 5v14M9 19h6" stroke={c} strokeWidth="1.8" strokeLinecap="round"/>
    </svg>
  ),
  tooth: (s=18,c='currentColor') => (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none">
      <path d="M7.5 3.5c-2 0-3.5 1.6-3.5 3.7 0 1.6.5 2.7 1 4 .6 1.7.5 3 .9 5.4.3 1.7 1 4.4 1.9 4.4 1 0 1-2 1.4-3.4.3-1.2.7-1.7 1.3-1.7s1 .5 1.3 1.7c.4 1.4.4 3.4 1.4 3.4.9 0 1.6-2.7 1.9-4.4.4-2.4.3-3.7.9-5.4.5-1.3 1-2.4 1-4 0-2.1-1.5-3.7-3.5-3.7-1.5 0-2.6.9-4 .9s-2.5-.9-4-.9z" stroke={c} strokeWidth="1.6" strokeLinejoin="round"/>
    </svg>
  ),
};

// ─── Brand mark — small abstract "L/F" diamond ───────────────────
function BrandMark({ size = 22, color = 'var(--c-accent)' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none">
      <path d="M16 3l13 13-13 13L3 16 16 3z" stroke={color} strokeWidth="2.2" strokeLinejoin="round"/>
      <path d="M11 14v6h6" stroke={color} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  );
}

// ─── Phone frame ─────────────────────────────────────────────────
// A clean dark phone bezel that hosts a Telegram Mini App screen.
// Includes: minimal status bar, Telegram-style header, content area,
// optional Telegram "main button" pinned bottom.
function Phone({
  children,
  title = 'LabFrame AI',
  headerVariant = 'tg',          // 'tg' | 'none'
  headerOnLight = false,          // header copy color when content top is light
  mainBtn,                        // { label, kind: 'primary'|'ghost', icon? }
  bgScreen = 'var(--c-bg)',       // screen background behind content
  noChrome = false,               // hide phone bezel (rarely used)
  scroll = true,
}) {
  const headerColor = headerOnLight ? 'var(--c-ink)' : 'var(--c-on-dark)';
  return (
    <div style={{
      width: PHONE_W, height: PHONE_H, borderRadius: 44,
      background: '#05060C', padding: 6, boxSizing: 'border-box',
      boxShadow: '0 30px 60px -20px rgba(0,0,0,.6), 0 0 0 1px rgba(255,255,255,.04) inset',
      position: 'relative',
    }}>
      <div style={{
        width: '100%', height: '100%', borderRadius: 38, overflow: 'hidden',
        background: bgScreen, position: 'relative', color: 'var(--c-on-dark)',
        display: 'flex', flexDirection: 'column',
      }}>
        {/* mini status bar */}
        <div style={{
          height: 32, padding: '0 22px', display: 'flex',
          alignItems: 'center', justifyContent: 'space-between',
          fontSize: 12, fontWeight: 600, color: headerColor, flexShrink: 0,
          position: 'relative', zIndex: 5,
        }}>
          <span style={{ fontFeatureSettings:'"tnum"' }}>9:41</span>
          <div style={{
            position: 'absolute', left: '50%', top: 6, transform: 'translateX(-50%)',
            width: 90, height: 22, borderRadius: 14, background: '#000',
          }} />
          <span style={{ display:'flex', gap: 4, alignItems: 'center' }}>
            <svg width="14" height="10" viewBox="0 0 14 10"><path d="M1 6.5l1.5-1.5 2.5 2.5L11.5 1 13 2.5 5 10.5 1 6.5z" fill={headerColor}/></svg>
            <svg width="20" height="10" viewBox="0 0 20 10"><rect x="0.5" y="0.5" width="17" height="9" rx="2" stroke={headerColor} fill="none"/><rect x="2" y="2" width="14" height="6" rx="1" fill={headerColor}/></svg>
          </span>
        </div>

        {/* Telegram-style mini-app header */}
        {headerVariant === 'tg' && (
          <div style={{
            padding: '4px 16px 10px', display: 'flex',
            alignItems: 'center', justifyContent: 'space-between',
            color: headerColor, flexShrink: 0,
          }}>
            <button style={btnReset()}>
              <span style={{ opacity: 0.75 }}>{I.back(20, headerColor)}</span>
            </button>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <BrandMark size={14} color={headerColor === 'var(--c-on-dark)' ? 'var(--c-accent)' : 'var(--c-ink)'} />
              <span style={{ fontSize: 14, fontWeight: 600, letterSpacing: -0.2 }}>{title}</span>
            </div>
            <button style={btnReset()}>
              <span style={{ opacity: 0.75 }}>{I.more(20, headerColor)}</span>
            </button>
          </div>
        )}

        {/* content */}
        <div className="phone-scroll" style={{
          flex: 1, overflowY: scroll ? 'auto' : 'hidden', position: 'relative',
        }}>
          {children}
        </div>

        {/* Telegram main button */}
        {mainBtn && (
          <div style={{ padding: '8px 12px 14px', flexShrink: 0 }}>
            <MainButton {...mainBtn} />
          </div>
        )}

        {/* home indicator */}
        <div style={{
          position: 'absolute', bottom: 5, left: 0, right: 0, display: 'flex',
          justifyContent: 'center', pointerEvents: 'none',
        }}>
          <div style={{ width: 110, height: 4, borderRadius: 4, background: headerOnLight ? 'rgba(15,18,33,0.4)' : 'rgba(239,243,255,0.55)' }} />
        </div>
      </div>
    </div>
  );
}

const btnReset = () => ({ background: 'none', border: 0, padding: 0, cursor: 'pointer', color: 'inherit', display:'flex' });

// ─── Reusable bits ───────────────────────────────────────────────
function MainButton({ label, kind = 'primary', icon }) {
  const isPrimary = kind === 'primary';
  return (
    <div style={{
      height: 52, borderRadius: 16, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
      background: isPrimary ? 'var(--c-accent)' : 'rgba(239,243,255,0.06)',
      color: isPrimary ? 'var(--c-ink)' : 'var(--c-on-dark)',
      fontSize: 16, fontWeight: 600, letterSpacing: -0.2,
      boxShadow: isPrimary ? '0 8px 24px -8px rgba(147,213,225,.5)' : 'none',
      border: isPrimary ? 'none' : '1px solid var(--c-line)',
    }}>
      {icon}{label}
    </div>
  );
}

function Pill({ children, kind = 'dark', size = 'md', icon, iconRight, style = {} }) {
  const sizes = { sm: [32, 12, '0 12px'], md: [40, 14, '0 16px'], lg: [48, 15, '0 20px'] };
  const [h, fs, pad] = sizes[size];
  const styles = {
    dark:    { bg: 'var(--c-card-dd)', fg: 'var(--c-on-dark)' },
    light:   { bg: 'var(--c-card-l)',  fg: 'var(--c-ink)' },
    white:   { bg: '#fff',             fg: 'var(--c-ink)' },
    accent:  { bg: 'var(--c-accent)',  fg: 'var(--c-ink)' },
    ghost:   { bg: 'rgba(239,243,255,0.06)', fg: 'var(--c-on-dark)', border: '1px solid var(--c-line)' },
    outline: { bg: 'transparent',      fg: 'var(--c-on-dark)', border: '1px solid var(--c-line)' },
  };
  const s = styles[kind];
  return (
    <div style={{
      height: h, padding: pad, borderRadius: 999,
      background: s.bg, color: s.fg, border: s.border || 'none',
      display: 'inline-flex', alignItems: 'center', gap: 8,
      fontSize: fs, fontWeight: 500, letterSpacing: -0.1, whiteSpace: 'nowrap',
      ...style,
    }}>
      {icon}{children}{iconRight}
    </div>
  );
}

// circular icon button used in many headers
function CircleBtn({ children, size = 38, kind = 'dark' }) {
  const styles = {
    dark:  { bg: 'var(--c-card-dd)', fg: 'var(--c-on-dark)' },
    light: { bg: 'var(--c-card-l)',  fg: 'var(--c-ink)' },
    white: { bg: '#fff',             fg: 'var(--c-ink)' },
    accent:{ bg: 'var(--c-accent)',  fg: 'var(--c-ink)' },
    ghost: { bg: 'rgba(239,243,255,0.06)', fg: 'var(--c-on-dark)' },
  };
  const s = styles[kind];
  return (
    <div style={{
      width: size, height: size, borderRadius: 999,
      background: s.bg, color: s.fg,
      display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
    }}>{children}</div>
  );
}

// big chunky card for screen sections
function Card({ children, kind = 'dark', pad = 18, radius = 24, style = {} }) {
  const bgs = {
    dark:   { bg: 'var(--c-card-d)',  fg: 'var(--c-on-dark)' },
    deep:   { bg: 'var(--c-card-dd)', fg: 'var(--c-on-dark)' },
    light:  { bg: 'var(--c-card-l)',  fg: 'var(--c-ink)' },
    white:  { bg: '#fff',             fg: 'var(--c-ink)' },
    accent: { bg: 'var(--c-accent)',  fg: 'var(--c-ink)' },
    ghost:  { bg: 'rgba(239,243,255,0.04)', fg: 'var(--c-on-dark)' },
  };
  const s = bgs[kind];
  return (
    <div style={{
      background: s.bg, color: s.fg, borderRadius: radius, padding: pad,
      ...style,
    }}>{children}</div>
  );
}

// small label/tag chip
function Tag({ children, kind = 'dark', style = {} }) {
  const styles = {
    dark:   { bg: 'rgba(15,18,33,0.6)', fg: '#EFF3FF' },
    light:  { bg: 'rgba(239,243,255,0.85)', fg: 'var(--c-ink)' },
    accent: { bg: 'var(--c-accent)', fg: 'var(--c-ink)' },
    ghost:  { bg: 'rgba(239,243,255,0.08)', fg: 'var(--c-on-dark)' },
    onlight:{ bg: 'rgba(15,18,33,0.06)', fg: 'var(--c-ink)' },
  };
  const s = styles[kind];
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 4,
      padding: '4px 10px', borderRadius: 999,
      background: s.bg, color: s.fg, fontSize: 11, fontWeight: 500, letterSpacing: 0.1,
      ...style,
    }}>{children}</span>
  );
}

// striped placeholder block (for hand-drawn imagery alternatives)
function StripePlaceholder({ w = '100%', h = 120, radius = 20, label, light = false, style = {} }) {
  const base = light ? '#D8DEE8' : '#252A3F';
  const stripe = light ? '#C7CFDC' : '#2D3349';
  return (
    <div style={{
      width: w, height: h, borderRadius: radius,
      background: `repeating-linear-gradient(135deg, ${base} 0 12px, ${stripe} 12px 24px)`,
      display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden',
      ...style,
    }}>
      {label && <span className="mono" style={{
        fontSize: 11, padding: '6px 12px', borderRadius: 999,
        background: light ? 'rgba(255,255,255,0.85)' : 'rgba(15,18,33,0.65)',
        color: light ? 'var(--c-ink)' : 'var(--c-on-dark)',
      }}>{label}</span>}
    </div>
  );
}

Object.assign(window, {
  Phone, MainButton, Pill, CircleBtn, Card, Tag, BrandMark, I, StripePlaceholder,
  PHONE_W, PHONE_H,
});
