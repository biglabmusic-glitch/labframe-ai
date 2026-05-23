interface BrandMarkProps {
  size?: number;
  /** Цвет «уголков»-рамки. По умолчанию — фирменный тёмно-синий. */
  color?: string;
  /** Цвет акцентного кружка. По умолчанию — мягкий голубой. */
  accent?: string;
  /** Толщина линии рамки относительно size. По умолчанию 0.05. */
  strokeRatio?: number;
}

/**
 * Логотип LabFrame Ai: две L-образные скобки, образующие открытую квадратную рамку
 * (символ кадра / видоискателя) + акцентный кружок в правом верхнем углу.
 *
 * Цвет рамки переопределяется через `color`, поэтому марк ложится и на светлый,
 * и на тёмный фон. На тёмном фоне передавайте `color="var(--c-on-dark)"`.
 */
export function BrandMark({
  size = 32,
  color = '#0F1221',
  accent = '#A5BCD9',
  strokeRatio = 0.07,
}: BrandMarkProps) {
  const stroke = Math.max(1.4, size * strokeRatio);
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" fill="none">
      {/* Верхняя L: горизонталь сверху + вертикаль справа */}
      <path
        d="M22 18 H82 V58"
        stroke={color}
        strokeWidth={stroke}
        strokeLinecap="square"
        fill="none"
      />
      {/* Нижняя L: вертикаль слева + горизонталь снизу */}
      <path
        d="M18 42 V82 H78"
        stroke={color}
        strokeWidth={stroke}
        strokeLinecap="square"
        fill="none"
      />
      {/* Акцентный кружок в правом верхнем углу */}
      <circle cx="74" cy="26" r="9" fill={accent} />
    </svg>
  );
}

/** Полный лого-блок «знак + LabFrame Ai» — для splash и hero. */
export function BrandLockup({
  size = 96,
  color = '#0F1221',
  accent = '#A5BCD9',
  textColor = '#9AA0AC',
  align = 'center',
}: BrandMarkProps & { textColor?: string; align?: 'left' | 'center' }) {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: align === 'center' ? 'center' : 'flex-start',
        gap: size * 0.18,
      }}
    >
      <BrandMark size={size} color={color} accent={accent} />
      <div
        style={{
          fontFamily: "'Onest', sans-serif",
          fontWeight: 400,
          fontSize: size * 0.32,
          letterSpacing: -0.3,
          color: textColor,
          lineHeight: 1,
        }}
      >
        LabFrame <span style={{ fontWeight: 700 }}>A</span>
        <span
          style={{
            fontWeight: 700,
            position: 'relative',
            display: 'inline-block',
          }}
        >
          i
          <span
            style={{
              position: 'absolute',
              top: size * 0.04,
              left: '52%',
              width: size * 0.08,
              height: size * 0.08,
              borderRadius: '50%',
              background: accent,
            }}
          />
        </span>
      </div>
    </div>
  );
}
