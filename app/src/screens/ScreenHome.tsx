import { Screen } from '../components/Screen';
import { Card } from '../components/primitives/Card';
import { CircleBtn } from '../components/primitives/CircleBtn';
import { Tag } from '../components/primitives/Tag';
import { BrandMark } from '../components/primitives/BrandMark';
import { UsageBar } from '../components/UsageBar';
import {
  IconArrow,
  IconGrid,
  IconTooth,
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
  const { user, brand, history, resetDraft } = useApp();
  const { push } = useRouter();

  useBackButton(() => WebApp?.close?.());
  useMainButton(null);

  const go = (r: RouteId) => () => push(r);

  // «Бренд заполнен» — нужен либо логотип, либо имя мастера.
  // Это используем для подсветки CTA «заполните профиль» в шапке.
  const brandReady = Boolean(brand.logoUrl || brand.masterName);

  const admin = Boolean(user.isAdmin);

  return (
    <Screen>
      {/* брендовая мини-шапка с beta-лейблом — сейчас в тестовом режиме, адаптируемся под фидбэк юзеров */}
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
        <span
          className="mono"
          style={{
            fontSize: 9,
            fontWeight: 700,
            letterSpacing: 1,
            padding: '2px 6px',
            borderRadius: 4,
            background: 'rgba(147,213,225,0.12)',
            color: 'var(--c-accent)',
            border: '1px solid rgba(147,213,225,0.25)',
          }}
        >
          BETA
        </span>
      </div>

      {/* Identity-блок — кликабельный, ведёт в «Мой бренд» (логотип/имя/хэштеги).
          Это убирает дубликат «Мой бренд» из 2x2 грида ниже. */}
      <div
        role="button"
        tabIndex={0}
        onClick={() => push('mybrand')}
        style={{
          padding: '8px 22px 14px',
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          cursor: 'pointer',
        }}
      >
        <div
          style={{
            width: 44,
            height: 44,
            borderRadius: 999,
            background: brand.logoUrl ? 'transparent' : 'var(--c-card-dd)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 16,
            fontWeight: 600,
            color: 'var(--c-accent)',
            overflow: 'hidden',
            border: brand.logoUrl ? '1px solid var(--c-line)' : 'none',
          }}
        >
          {brand.logoUrl ? (
            <img src={brand.logoUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          ) : (
            user.initials
          )}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13, color: 'var(--c-on-dark-2)' }}>
            {brandReady ? 'Привет,' : 'Профиль не заполнен'}
          </div>
          <div
            style={{
              fontSize: 16,
              fontWeight: 600,
              letterSpacing: -0.2,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {brand.masterName || user.name}
          </div>
        </div>
        {/* Тариф — кликабельный, ведёт на /myplan (детали подписки). Заменяет карточку «Тарифы». */}
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); push('myplan'); }}
          style={{
            padding: '5px 10px',
            borderRadius: 999,
            border: '1px solid var(--c-line)',
            background: 'rgba(239,243,255,0.04)',
            color: 'var(--c-on-dark-2)',
            fontSize: 10,
            fontWeight: 700,
            letterSpacing: 0.8,
            cursor: 'pointer',
            display: 'inline-flex',
            alignItems: 'center',
            gap: 4,
          }}
        >
          {user.plan.toUpperCase()}
          <span style={{ opacity: 0.5, fontSize: 9 }}>→</span>
        </button>
      </div>

      {/* usage-bar — главная панель прогресса генераций. Тап ведёт на «Моя подписка». */}
      <div style={{ padding: '0 16px 18px' }}>
        <UsageBar
          used={user.usage.used}
          limit={user.usage.limit}
          plan={user.plan}
          onUpgrade={() => push('pricing')}
          onOpen={() => push('myplan')}
        />
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

      {/* Если профиль не заполнен — большой CTA. Без него AI не знает имя/лого/хэштеги
          и работает в обезличенном режиме. */}
      {!brandReady && (
        <div style={{ padding: '0 16px 12px' }}>
          <Card
            kind="dark"
            pad={14}
            radius={20}
            onClick={go('mybrand')}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 12,
              background: 'rgba(147,213,225,0.08)',
              border: '1px solid rgba(147,213,225,0.28)',
            }}
          >
            <div
              style={{
                width: 38, height: 38, borderRadius: 12,
                background: 'rgba(147,213,225,0.18)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 18,
              }}
            >
              ✨
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 13.5, fontWeight: 600 }}>Заполните профиль</div>
              <div style={{ fontSize: 11.5, color: 'var(--c-on-dark-2)', marginTop: 2 }}>
                AI учтёт ваше имя, логотип и хэштеги в каждой работе
              </div>
            </div>
            <IconArrow size={14} color="var(--c-accent)" />
          </Card>
        </div>
      )}

      {/* Быстрая ссылка — только Примеры. «Мой бренд» теперь сверху (шапка-кликабельная).
          «Тарифы» переехали в FREE-пилл, «Как снимать» — в ScreenUpload. */}
      <div style={{ padding: '0 16px 12px', display: 'grid', gridTemplateColumns: '1fr', gap: 8 }}>
        <Card kind="dark" pad={14} radius={20} onClick={go('examples')} style={{ position: 'relative' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <CircleBtn size={32} kind="ghost">
                <IconGrid size={16} color="var(--c-accent)" />
              </CircleBtn>
              <div>
                <div style={{ fontSize: 14, fontWeight: 600 }}>Примеры</div>
                <div style={{ fontSize: 11, color: 'var(--c-on-dark-2)', marginTop: 2 }}>
                  Реальные до / после по стилям
                </div>
              </div>
            </div>
            <IconArrow size={14} color="var(--c-on-dark-3)" />
          </div>
        </Card>
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
          ВАШИ РАБОТЫ
        </div>
        {history.length > 0 && (
          <span style={{ fontSize: 11, color: 'var(--c-on-dark-3)' }}>{history.length}</span>
        )}
      </div>

      {admin && (
        <div style={{ padding: '0 16px 12px' }}>
          <Card
            kind="dark"
            pad={12}
            radius={16}
            onClick={() => push('admin')}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              background: 'rgba(255,210,128,0.06)',
              border: '1px solid rgba(255,210,128,0.20)',
            }}
          >
            <div style={{ fontSize: 18, width: 32, textAlign: 'center' }}>🛠</div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 13, fontWeight: 600 }}>Админка</div>
              <div style={{ fontSize: 11, color: 'var(--c-on-dark-2)', marginTop: 1 }}>
                Мониторинг и управление юзерами
              </div>
            </div>
            <IconArrow size={14} color="var(--c-on-dark-3)" />
          </Card>
        </div>
      )}

      {history.length === 0 ? (
        <div style={{ padding: '0 16px 18px' }}>
          <Card kind="dark" pad={14} radius={18} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <CircleBtn size={36} kind="ghost">
              <IconTooth size={18} color="var(--c-accent)" />
            </CircleBtn>
            <div>
              <div style={{ fontSize: 13, fontWeight: 600 }}>Здесь появятся ваши посты</div>
              <div style={{ fontSize: 11.5, color: 'var(--c-on-dark-2)', marginTop: 2 }}>
                Создайте первый — лента будет с миниатюрами.
              </div>
            </div>
          </Card>
        </div>
      ) : (
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
                  overflow: 'hidden',
                  color: dark ? 'var(--c-on-dark)' : 'var(--c-ink)',
                }}
              >
                {p.resultUrl ? (
                  <img
                    src={p.resultUrl}
                    alt=""
                    style={{
                      position: 'absolute',
                      inset: 0,
                      width: '100%',
                      height: '100%',
                      objectFit: 'cover',
                    }}
                  />
                ) : (
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
                )}
                <div
                  className="mono"
                  style={{
                    position: 'relative',
                    zIndex: 1,
                    fontSize: 9,
                    letterSpacing: 0.4,
                    padding: '2px 6px',
                    borderRadius: 6,
                    background: 'rgba(15,18,33,0.55)',
                    color: 'rgba(239,243,255,0.9)',
                  }}
                >
                  {STYLE_LABELS[p.style]} · {FORMAT_LABELS[p.format]}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </Screen>
  );
}
