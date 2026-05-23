import { Screen } from '../components/Screen';
import { Card } from '../components/primitives/Card';
import { CircleBtn } from '../components/primitives/CircleBtn';
import { Tag } from '../components/primitives/Tag';
import { BrandMark } from '../components/primitives/BrandMark';
import {
  IconArrow,
  IconCam,
  IconGrid,
  IconSpark,
  IconTooth,
  IconUser,
} from '../components/primitives/icons';
import { useApp } from '../state/AppContext';
import { useBackButton } from '../telegram/useBackButton';
import { useMainButton } from '../telegram/useMainButton';
import { useRouter, type RouteId } from '../router/Router';
import { WebApp } from '../telegram/webapp';

const STYLE_LABELS: Record<string, string> = {
  dark: 'Premium Dark',
  clean: 'Clean White',
  soft: 'Soft Studio',
};
const FORMAT_LABELS: Record<string, string> = {
  '1x1': '1:1',
  '4x5': '4:5',
  '9x16': '9:16',
};

export function ScreenHome() {
  const { user, history, resetDraft } = useApp();
  const { push } = useRouter();

  useBackButton(() => WebApp?.close?.());
  useMainButton(null);

  const go = (r: RouteId) => () => push(r);

  return (
    <Screen>
      {/* брендовая мини-шапка */}
      <div
        style={{
          padding: '12px 22px 4px',
          display: 'flex',
          alignItems: 'center',
          gap: 8,
        }}
      >
        <BrandMark size={20} color="var(--c-on-dark)" accent="#A5BCD9" />
        <span
          style={{
            fontSize: 13,
            fontWeight: 500,
            color: 'var(--c-on-dark-2)',
            letterSpacing: -0.1,
          }}
        >
          LabFrame <span style={{ fontWeight: 700, color: 'var(--c-on-dark)' }}>Ai</span>
        </span>
      </div>

      <div style={{ padding: '8px 22px 18px', display: 'flex', alignItems: 'center', gap: 12 }}>
        <div
          style={{
            width: 44,
            height: 44,
            borderRadius: 999,
            background: 'var(--c-card-dd)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 16,
            fontWeight: 600,
            color: 'var(--c-accent)',
          }}
        >
          {user.initials}
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 13, color: 'var(--c-on-dark-2)' }}>Привет,</div>
          <div style={{ fontSize: 16, fontWeight: 600, letterSpacing: -0.2 }}>{user.name}</div>
        </div>
        <Tag kind="ghost">
          {user.plan.toUpperCase()} · {user.usage.used}/{user.usage.limit}
        </Tag>
      </div>

      {/* huge CTA */}
      <div style={{ padding: '0 16px 12px' }}>
        <div
          role="button"
          tabIndex={0}
          onClick={() => {
            resetDraft();
            push('upload');
          }}
          style={{
            position: 'relative',
            borderRadius: 28,
            overflow: 'hidden',
            background: 'var(--c-accent)',
            color: 'var(--c-ink)',
            padding: '20px 20px 22px',
            minHeight: 168,
            cursor: 'pointer',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <Tag kind="dark" style={{ fontSize: 10 }}>
              основной флоу
            </Tag>
            <CircleBtn size={36} kind="dark">
              <IconArrow size={16} color="var(--c-accent)" />
            </CircleBtn>
          </div>
          <div style={{ marginTop: 30 }}>
            <div style={{ fontSize: 26, fontWeight: 600, letterSpacing: -0.6, lineHeight: 1.05 }}>
              Создать пост
            </div>
            <div style={{ fontSize: 13, opacity: 0.65, marginTop: 6 }}>
              Фото → стиль → бренд → готово за 20 секунд
            </div>
          </div>
          <div
            style={{
              position: 'absolute',
              right: -10,
              bottom: -20,
              width: 90,
              height: 110,
              borderRadius: 16,
              background: 'var(--c-ink)',
              padding: 6,
              transform: 'rotate(8deg)',
              opacity: 0.55,
            }}
          >
            <div
              style={{
                width: '100%',
                height: '100%',
                borderRadius: 12,
                background: 'var(--c-card-dd)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <IconTooth size={28} color="var(--c-accent)" />
            </div>
          </div>
        </div>
      </div>

      {/* 2x2 quick actions */}
      <div style={{ padding: '0 16px 12px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
        {[
          { t: 'Мой бренд', s: 'Логотип, имя, хэштеги', icon: IconUser,  route: 'mybrand' as RouteId },
          { t: 'Примеры',   s: 'До / после',            icon: IconGrid,  route: 'examples' as RouteId },
          { t: 'Тарифы',    s: 'Free · Start · Pro',    icon: IconSpark, route: 'pricing' as RouteId },
          { t: 'Помощь',    s: 'Как снимать',           icon: IconCam,   route: 'help' as RouteId },
        ].map((it) => (
          <Card key={it.t} kind="dark" pad={14} radius={20} onClick={go(it.route)} style={{ position: 'relative' }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
              <CircleBtn size={32} kind="ghost">
                <it.icon size={16} color="var(--c-accent)" />
              </CircleBtn>
              <IconArrow size={14} color="var(--c-on-dark-3)" />
            </div>
            <div style={{ marginTop: 12, fontSize: 14, fontWeight: 600 }}>{it.t}</div>
            <div style={{ fontSize: 11, color: 'var(--c-on-dark-2)', marginTop: 2 }}>{it.s}</div>
          </Card>
        ))}
      </div>

      <div
        style={{
          padding: '6px 22px 8px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <div
          className="mono"
          style={{ fontSize: 10, letterSpacing: 0.6, color: 'var(--c-on-dark-3)' }}
        >
          ПОСЛЕДНИЕ
        </div>
        <span style={{ fontSize: 12, color: 'var(--c-accent)' }}>смотреть все →</span>
      </div>
      <div
        className="no-scrollbar"
        style={{ padding: '0 16px 18px', display: 'flex', gap: 8, overflowX: 'auto' }}
      >
        {history.map((p) => {
          const dark = p.dark;
          return (
            <div
              key={p.id}
              style={{
                flex: '0 0 110px',
                height: 130,
                borderRadius: 16,
                background: p.thumbBg,
                display: 'flex',
                alignItems: 'flex-end',
                padding: 8,
                position: 'relative',
                color: dark ? 'var(--c-on-dark)' : 'var(--c-ink)',
              }}
            >
              <div
                style={{
                  position: 'absolute',
                  top: '50%',
                  left: '50%',
                  transform: 'translate(-50%,-50%)',
                  color: dark ? 'rgba(239,243,255,0.7)' : 'rgba(15,18,33,0.6)',
                }}
              >
                <IconTooth size={34} />
              </div>
              <div
                className="mono"
                style={{ fontSize: 9, letterSpacing: 0.4, opacity: 0.7 }}
              >
                {STYLE_LABELS[p.style]} · {FORMAT_LABELS[p.format]}
              </div>
            </div>
          );
        })}
      </div>
    </Screen>
  );
}
