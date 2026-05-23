import { useRef, useState } from 'react';
import { Screen } from '../components/Screen';
import { ScreenIntro } from '../components/ScreenIntro';
import { Card } from '../components/primitives/Card';
import { CircleBtn } from '../components/primitives/CircleBtn';
import { Pill } from '../components/primitives/Pill';
import { Tag } from '../components/primitives/Tag';
import { BrandMark } from '../components/primitives/BrandMark';
import { IconImg, IconPlus, IconSpark } from '../components/primitives/icons';
import { useApp } from '../state/AppContext';
import { useMainButton } from '../telegram/useMainButton';
import { useBackButton } from '../telegram/useBackButton';
import { useRouter } from '../router/Router';
import type { StyleId } from '../state/types';

const STYLE_LABELS: { id: StyleId; label: string }[] = [
  { id: 'clean', label: 'Clean White' },
  { id: 'dark',  label: 'Premium Dark' },
  { id: 'soft',  label: 'Soft Studio' },
];

const SUGGEST_TAGS = ['#керамика', '#виниры', '#dentallab', '#ceramist', '#dentalart', '#emax'];

export function ScreenOnboardingBrand() {
  const { user, brand, setBrand, completeOnboarding } = useApp();
  const { reset } = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);

  const [masterName, setMasterName] = useState(brand.masterName ?? user.name ?? '');
  const [labName,    setLabName]    = useState(brand.labName    ?? '');
  const [defaultStyle, setDefaultStyle] = useState<StyleId | undefined>(brand.defaultStyle);
  const [hashtags, setHashtags] = useState<string[]>(brand.hashtags ?? []);
  const [newTag, setNewTag] = useState('');
  const [logoPreview, setLogoPreview] = useState<string | undefined>(brand.logoUrl);
  const [logoFileName, setLogoFileName] = useState<string | undefined>(brand.logoFileName);

  useBackButton(null);
  useMainButton({
    text: '✨ Готово, начать',
    onClick: () => {
      setBrand({
        masterName: masterName.trim() || undefined,
        labName: labName.trim() || undefined,
        defaultStyle,
        hashtags,
        logoUrl: logoPreview,
        logoFileName,
      });
      completeOnboarding();
      reset('home');
    },
    enabled: masterName.trim().length > 1,
  });

  const onLogoFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    setLogoPreview(URL.createObjectURL(f));
    setLogoFileName(f.name);
  };

  const addTag = (raw: string) => {
    const t = raw.trim().replace(/\s+/g, '');
    if (!t) return;
    const formatted = t.startsWith('#') ? t : `#${t}`;
    if (hashtags.includes(formatted)) return;
    setHashtags([...hashtags, formatted]);
    setNewTag('');
  };

  const removeTag = (t: string) => setHashtags(hashtags.filter((x) => x !== t));

  const inputStyle: React.CSSProperties = {
    width: '100%',
    background: 'transparent',
    border: 'none',
    outline: 'none',
    color: 'var(--c-on-dark)',
    fontSize: 15,
    fontWeight: 500,
    padding: '4px 0 0',
    fontFamily: 'inherit',
  };

  return (
    <Screen>
      <input
        ref={fileRef}
        type="file"
        accept="image/png,image/jpeg,image/jpg"
        style={{ display: 'none' }}
        onChange={onLogoFile}
      />

      {/* брендовая шапка */}
      <div style={{ padding: '14px 22px 8px', display: 'flex', alignItems: 'center', gap: 10 }}>
        <BrandMark size={24} color="var(--c-on-dark)" accent="#A5BCD9" />
        <span style={{ fontSize: 14, fontWeight: 500, color: 'var(--c-on-dark-2)', letterSpacing: -0.1 }}>
          LabFrame <span style={{ fontWeight: 700, color: 'var(--c-on-dark)' }}>Ai</span>
        </span>
      </div>

      <ScreenIntro
        title="Расскажите о себе"
        sub="Чтобы бот добавлял ваш бренд к каждому посту автоматически. Можно изменить в любой момент."
      />

      {/* Логотип */}
      <div style={{ padding: '0 16px 12px' }}>
        <Card kind="dark" pad={16} radius={22}>
          <div
            className="mono"
            style={{ fontSize: 10, letterSpacing: 0.6, color: 'var(--c-on-dark-3)', marginBottom: 12 }}
          >
            ЛОГОТИП
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <div
              role="button"
              tabIndex={0}
              onClick={() => fileRef.current?.click()}
              style={{
                width: 72,
                height: 72,
                borderRadius: 18,
                background: logoPreview ? 'transparent' : 'rgba(239,243,255,0.06)',
                border: logoPreview ? 'none' : '1.5px dashed rgba(147,213,225,0.45)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer',
                overflow: 'hidden',
                flexShrink: 0,
              }}
            >
              {logoPreview ? (
                <img
                  src={logoPreview}
                  alt="logo"
                  style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                />
              ) : (
                <IconImg size={26} color="var(--c-accent)" />
              )}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              {logoPreview ? (
                <>
                  <div style={{ fontSize: 14, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {logoFileName ?? 'logo.png'}
                  </div>
                  <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
                    <Pill size="sm" kind="ghost" onClick={() => fileRef.current?.click()}>
                      заменить
                    </Pill>
                    <Pill
                      size="sm"
                      kind="ghost"
                      onClick={() => {
                        setLogoPreview(undefined);
                        setLogoFileName(undefined);
                      }}
                    >
                      удалить
                    </Pill>
                  </div>
                </>
              ) : (
                <>
                  <div style={{ fontSize: 14, fontWeight: 600 }}>Добавьте логотип</div>
                  <div style={{ fontSize: 11.5, color: 'var(--c-on-dark-2)', marginTop: 2 }}>
                    PNG или JPG · опционально
                  </div>
                </>
              )}
            </div>
          </div>
        </Card>
      </div>

      {/* Имя мастера */}
      <div style={{ padding: '0 16px 8px' }}>
        <div
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
            ИМЯ МАСТЕРА*
          </div>
          <input
            value={masterName}
            onChange={(e) => setMasterName(e.target.value)}
            placeholder="Керамист Иван Петров"
            style={inputStyle}
            autoFocus
          />
        </div>
      </div>

      {/* Лаборатория */}
      <div style={{ padding: '0 16px 12px' }}>
        <div
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
            НАЗВАНИЕ ЛАБОРАТОРИИ
          </div>
          <input
            value={labName}
            onChange={(e) => setLabName(e.target.value)}
            placeholder="Petrov Ceramic Lab"
            style={inputStyle}
          />
        </div>
      </div>

      {/* Стиль по умолчанию */}
      <div style={{ padding: '0 16px 12px' }}>
        <Card kind="dark" pad={16} radius={22}>
          <div
            className="mono"
            style={{ fontSize: 10, letterSpacing: 0.6, color: 'var(--c-on-dark-3)', marginBottom: 10 }}
          >
            СТИЛЬ ПО УМОЛЧАНИЮ
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {STYLE_LABELS.map((s) => (
              <Pill
                key={s.id}
                size="sm"
                kind={defaultStyle === s.id ? 'accent' : 'ghost'}
                onClick={() => setDefaultStyle(defaultStyle === s.id ? undefined : s.id)}
              >
                {s.label}
              </Pill>
            ))}
          </div>
        </Card>
      </div>

      {/* Хэштеги */}
      <div style={{ padding: '0 16px 16px' }}>
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
              ФИРМЕННЫЕ ХЭШТЕГИ
            </div>
            <span style={{ fontSize: 10, color: 'var(--c-on-dark-3)' }}>{hashtags.length}</span>
          </div>

          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 12 }}>
            {hashtags.map((h) => (
              <Tag
                key={h}
                kind="ghost"
                style={{ fontSize: 11, cursor: 'pointer' }}
              >
                <span onClick={() => removeTag(h)}>{h} ×</span>
              </Tag>
            ))}
            {hashtags.length === 0 && (
              <div style={{ fontSize: 11.5, color: 'var(--c-on-dark-3)' }}>
                Подсказки ниже — или впишите свой
              </div>
            )}
          </div>

          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              padding: '8px 12px',
              borderRadius: 12,
              background: 'rgba(239,243,255,0.04)',
              border: '1px solid var(--c-line)',
              marginBottom: 10,
            }}
          >
            <input
              value={newTag}
              onChange={(e) => setNewTag(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && addTag(newTag)}
              placeholder="#свой_хэштег"
              style={{ ...inputStyle, padding: 0, fontSize: 13 }}
            />
            <CircleBtn size={26} kind="accent" onClick={() => addTag(newTag)}>
              <IconPlus size={14} />
            </CircleBtn>
          </div>

          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {SUGGEST_TAGS.filter((t) => !hashtags.includes(t)).map((t) => (
              <Pill key={t} size="sm" kind="ghost" onClick={() => addTag(t)}>
                + {t}
              </Pill>
            ))}
          </div>
        </Card>
      </div>

      {/* tip */}
      <div style={{ padding: '0 16px 24px' }}>
        <Card
          kind="ghost"
          pad={12}
          radius={16}
          style={{ display: 'flex', gap: 10, alignItems: 'center' }}
        >
          <CircleBtn size={28} kind="accent">
            <IconSpark size={12} />
          </CircleBtn>
          <div style={{ fontSize: 11.5, color: 'var(--c-on-dark-2)', lineHeight: 1.4 }}>
            Эти данные сохранятся и подставятся в каждый пост автоматически.
          </div>
        </Card>
      </div>
    </Screen>
  );
}
