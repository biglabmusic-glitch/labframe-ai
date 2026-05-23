import { Screen } from '../components/Screen';
import { ScreenIntro } from '../components/ScreenIntro';
import { BrandMark } from '../components/primitives/BrandMark';
import { Card } from '../components/primitives/Card';
import { Pill } from '../components/primitives/Pill';
import { Tag } from '../components/primitives/Tag';
import { IconEdit, IconPlus, IconRefresh } from '../components/primitives/icons';
import { useApp } from '../state/AppContext';
import { useMainButton } from '../telegram/useMainButton';
import { useBackButton } from '../telegram/useBackButton';
import { useRouter } from '../router/Router';

export function ScreenMyBrand() {
  const { brand } = useApp();
  const { back } = useRouter();

  useBackButton(back);
  useMainButton({
    text: 'Сохранить',
    onClick: () => back(),
  });

  return (
    <Screen>
      <ScreenIntro
        title="Мой бренд"
        sub="Один раз сохраните данные — бот будет автоматически добавлять их к новым публикациям."
      />

      <div style={{ padding: '0 16px 12px' }}>
        <Card kind="dark" pad={16} radius={22}>
          <div
            className="mono"
            style={{
              fontSize: 10,
              letterSpacing: 0.6,
              color: 'var(--c-on-dark-3)',
              marginBottom: 12,
            }}
          >
            ЛОГОТИП
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <div
              style={{
                width: 72,
                height: 72,
                borderRadius: 18,
                background: 'var(--c-card-l)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <BrandMark size={36} color="var(--c-ink)" />
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 14, fontWeight: 600 }}>
                {brand.logoFileName ?? 'не загружен'}
              </div>
              <div style={{ fontSize: 11, color: 'var(--c-on-dark-2)', marginTop: 2 }}>
                загружен 12 марта · 256 КБ
              </div>
              <div style={{ display: 'flex', gap: 6, marginTop: 10 }}>
                <Pill size="sm" kind="ghost" icon={<IconRefresh size={12} />}>
                  заменить
                </Pill>
                <Pill size="sm" kind="ghost">
                  удалить
                </Pill>
              </div>
            </div>
          </div>
        </Card>
      </div>

      <div style={{ padding: '0 16px 12px', display: 'flex', flexDirection: 'column', gap: 8 }}>
        {[
          { lbl: 'Имя мастера', val: brand.masterName ?? '—' },
          { lbl: 'Название лаборатории', val: brand.labName ?? '—' },
        ].map((f) => (
          <div
            key={f.lbl}
            style={{
              padding: '14px 16px',
              borderRadius: 18,
              background: 'var(--c-card-d)',
              border: '1px solid var(--c-line)',
            }}
          >
            <div
              className="mono"
              style={{ fontSize: 10, letterSpacing: 0.6, color: 'var(--c-on-dark-3)' }}
            >
              {f.lbl.toUpperCase()}
            </div>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                marginTop: 4,
              }}
            >
              <span style={{ fontSize: 15, fontWeight: 500 }}>{f.val}</span>
              <span style={{ color: 'var(--c-on-dark-3)' }}>
                <IconEdit size={14} />
              </span>
            </div>
          </div>
        ))}
      </div>

      <div style={{ padding: '0 16px 12px' }}>
        <Card kind="dark" pad={16} radius={22}>
          <div
            className="mono"
            style={{
              fontSize: 10,
              letterSpacing: 0.6,
              color: 'var(--c-on-dark-3)',
              marginBottom: 12,
            }}
          >
            ПРЕДПОЧТЕНИЯ
          </div>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginBottom: 12,
            }}
          >
            <span style={{ fontSize: 13 }}>Стиль по умолчанию</span>
            <Pill size="sm" kind="accent">
              Premium Dark
            </Pill>
          </div>
          <div style={{ height: 1, background: 'var(--c-line)', margin: '4px 0 12px' }} />
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: 13 }}>Размещение логотипа</span>
            <Pill size="sm" kind="ghost">
              нижний правый
            </Pill>
          </div>
        </Card>
      </div>

      <div style={{ padding: '0 16px 20px' }}>
        <Card kind="dark" pad={16} radius={22}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginBottom: 10,
            }}
          >
            <div
              className="mono"
              style={{ fontSize: 10, letterSpacing: 0.6, color: 'var(--c-on-dark-3)' }}
            >
              ФИРМЕННЫЕ ХЭШТЕГИ · {brand.hashtags.length}
            </div>
            <span style={{ color: 'var(--c-accent)' }}>
              <IconPlus size={14} />
            </span>
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {brand.hashtags.map((h) => (
              <Tag key={h} kind="ghost" style={{ fontSize: 11 }}>
                {h}
              </Tag>
            ))}
          </div>
        </Card>
      </div>
    </Screen>
  );
}
