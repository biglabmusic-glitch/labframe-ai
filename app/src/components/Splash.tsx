import { BrandLockup } from './primitives/BrandMark';

/**
 * Сплэш-экран на момент загрузки. Показывается, пока инициализируется Telegram
 * WebApp и тянутся шрифты. Светлый фон — как у фирменного логотипа.
 */
export function Splash() {
  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: '#F4F6FB',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 28,
        zIndex: 9999,
      }}
    >
      <BrandLockup size={120} />
      <div
        style={{
          width: 36,
          height: 2,
          borderRadius: 2,
          background: 'rgba(15,18,33,0.12)',
          overflow: 'hidden',
          position: 'relative',
        }}
      >
        <div
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            bottom: 0,
            width: '40%',
            background: '#A5BCD9',
            animation: 'lf-splash-bar 1.1s ease-in-out infinite',
          }}
        />
      </div>
      <style>{`
        @keyframes lf-splash-bar {
          0%   { transform: translateX(-100%); }
          50%  { transform: translateX(40%); }
          100% { transform: translateX(140%); }
        }
      `}</style>
    </div>
  );
}
