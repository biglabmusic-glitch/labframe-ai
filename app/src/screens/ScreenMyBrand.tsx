import { useRef, useState } from 'react';
import { Screen } from '../components/Screen';
import { ScreenIntro } from '../components/ScreenIntro';
import { BrandMark } from '../components/primitives/BrandMark';
import { Card } from '../components/primitives/Card';
import { CircleBtn } from '../components/primitives/CircleBtn';
import { Pill } from '../components/primitives/Pill';
import { Tag } from '../components/primitives/Tag';
import { IconImg, IconPlus, IconRefresh } from '../components/primitives/icons';
import { useApp } from '../state/AppContext';
import { useMainButton } from '../telegram/useMainButton';
import { useBackButton } from '../telegram/useBackButton';
import { useRouter } from '../router/Router';
import type { StyleId } from '../state/types';
import { api, isBackendReady } from '../api/client';

const STYLE_LABELS: { id: StyleId; label: string }[] = [
  { id: 'clean', label: 'Clean White' },
  { id: 'dark',  label: 'Premium Dark' },
  { id: 'soft',  label: 'Soft Studio' },
];

const PLACEMENT_LABELS: Record<NonNullable<BrandData['logoPlacement']>, string> = {
  'bottom-right': 'нижний правый',
  'bottom-left':  'нижний левый',
  'top-right':    'верхний правый',
  'top-left':     'верхний левый',
};

// re-export for type
import type { BrandData } from '../state/types';

const PLACEMENTS: BrandData['logoPlacement'][] = [
  'bottom-right',
  'bottom-left',
  'top-right',
  'top-left',
];

export function ScreenMyBrand() {
  const { brand, syncBrandToServer } = useApp();
  const { back } = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);

  const [masterName, setMasterName] = useState(brand.masterName ?? '');
  const [labName,    setLabName]    = useState(brand.labName    ?? '');
  const [defaultStyle, setDefaultStyle] = useState<StyleId | undefined>(brand.defaultStyle);
  const [placement, setPlacement] = useState<BrandData['logoPlacement']>(brand.logoPlacement);
  const [hashtags, setHashtags] = useState<string[]>(brand.hashtags ?? []);
  const [newTag, setNewTag] = useState('');
  const [logoUrl, setLogoUrl] = useState<string | undefined>(brand.logoUrl);
  const [logoFileName, setLogoFileName] = useState<string | undefined>(brand.logoFileName);
  const [logoPath, setLogoPath] = useState<string | undefined>(brand.logoPath);
  const [logoError, setLogoError] = useState<string | null>(null);
  const [logoWarn, setLogoWarn]   = useState<string | null>(null);
  const [logoUploading, setLogoUploading] = useState(false);

  useBackButton(back);
  useMainButton({
    text: logoUploading ? 'Загрузка логотипа…' : 'Сохранить',
    enabled: !logoUploading,
    progress: logoUploading,
    onClick: async () => {
      // Если лого только что загружен — logoPath есть, его и шлём в БД.
      // Если юзер удалил — removeLogo=true. В остальных случаях лого не меняем.
      const logoChanged = logoPath !== brand.logoPath;
      const removed     = !logoUrl && Boolean(brand.logoUrl);

      await syncBrandToServer({
        masterName: masterName.trim() || undefined,
        labName: labName.trim() || undefined,
        defaultStyle,
        logoPlacement: placement,
        hashtags,
        logoUrl,
        logoFileName,
        logoPath:   logoChanged && !removed ? logoPath : undefined,
        removeLogo: removed,
      });
      back();
    },
  });

  // Жёсткая валидация — отбрасываем явно неподходящие файлы.
  // Мягкая (warn) — пускаем, но подсвечиваем юзеру, что AI может сработать хуже.
  const onLogoFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    setLogoError(null);
    setLogoWarn(null);

    const isPng  = f.type === 'image/png';
    const isJpeg = f.type === 'image/jpeg' || f.type === 'image/jpg';
    if (!isPng && !isJpeg) {
      setLogoError('Только PNG или JPEG. SVG/WebP пока не поддерживаем.');
      return;
    }
    if (f.size > 2 * 1024 * 1024) {
      setLogoError('Файл больше 2 МБ. Сожмите в любом онлайн-компрессоре.');
      return;
    }

    // Проверяем размеры — загружаем как Image и смотрим naturalWidth/Height.
    const objUrl = URL.createObjectURL(f);
    const img = new Image();
    img.onload = async () => {
      const w = img.naturalWidth;
      const h = img.naturalHeight;
      const ratio = w / Math.max(h, 1);
      const warnings: string[] = [];
      if (w < 512 || h < 512) warnings.push(`мал (${w}×${h}, нужно ≥512×512)`);
      if (ratio < 0.8 || ratio > 1.25) warnings.push('не квадратный — AI может обрезать');
      if (isJpeg) warnings.push('JPEG: фон не прозрачный — лучше PNG');
      setLogoWarn(warnings.length ? `Логотип ${warnings.join('; ')}.` : null);
      setLogoUrl(objUrl);
      setLogoFileName(f.name);

      // Загрузка в Storage сразу при выборе — чтобы при «Сохранить» уже был logoPath.
      // Если бэкенд не настроен (mock-режим) — пропускаем, локальное превью остаётся.
      if (isBackendReady()) {
        setLogoUploading(true);
        try {
          const { logoPath: newPath } = await api.uploadLogo(f);
          setLogoPath(newPath);
        } catch (err) {
          setLogoError(`Не удалось загрузить логотип: ${err instanceof Error ? err.message : 'ошибка сети'}`);
        } finally {
          setLogoUploading(false);
        }
      }
    };
    img.onerror = () => {
      setLogoError('Не удалось прочитать файл как изображение.');
      URL.revokeObjectURL(objUrl);
    };
    img.src = objUrl;
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

      <ScreenIntro
        title="Мой бренд"
        sub="Эти данные подставятся в каждый новый пост автоматически."
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
                background: logoUrl ? 'var(--c-card-l)' : 'rgba(239,243,255,0.06)',
                border: logoUrl ? 'none' : '1.5px dashed rgba(147,213,225,0.45)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer',
                overflow: 'hidden',
                flexShrink: 0,
              }}
            >
              {logoUrl ? (
                <img
                  src={logoUrl}
                  alt="logo"
                  style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                />
              ) : (
                <BrandMark size={36} color="var(--c-on-dark-2)" />
              )}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div
                style={{
                  fontSize: 14,
                  fontWeight: 600,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                {logoFileName ?? 'не загружен'}
              </div>
              <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
                {logoUrl ? (
                  <>
                    <Pill size="sm" kind="ghost" icon={<IconRefresh size={12} />} onClick={() => fileRef.current?.click()}>
                      заменить
                    </Pill>
                    <Pill
                      size="sm"
                      kind="ghost"
                      onClick={() => {
                        setLogoUrl(undefined);
                        setLogoFileName(undefined);
                        setLogoPath(undefined);
                        setLogoError(null);
                        setLogoWarn(null);
                      }}
                    >
                      удалить
                    </Pill>
                  </>
                ) : (
                  <Pill size="sm" kind="accent" icon={<IconImg size={12} />} onClick={() => fileRef.current?.click()}>
                    загрузить
                  </Pill>
                )}
              </div>
            </div>
          </div>

          {logoError && (
            <div
              style={{
                marginTop: 10,
                padding: '8px 10px',
                borderRadius: 10,
                background: 'rgba(244,177,154,0.12)',
                border: '1px solid rgba(244,177,154,0.35)',
                fontSize: 11.5,
                color: '#F4B19A',
                lineHeight: 1.4,
              }}
            >
              {logoError}
            </div>
          )}
          {logoWarn && !logoError && (
            <div
              style={{
                marginTop: 10,
                padding: '8px 10px',
                borderRadius: 10,
                background: 'rgba(255,210,128,0.10)',
                border: '1px solid rgba(255,210,128,0.30)',
                fontSize: 11.5,
                color: '#E8C07A',
                lineHeight: 1.4,
              }}
            >
              ⚠️ {logoWarn}
            </div>
          )}

          {/* Требования к логотипу — короткий список, чтобы юзер с первого раза
              загрузил то, с чем AI умеет работать. */}
          <div
            style={{
              marginTop: 12,
              padding: 10,
              borderRadius: 12,
              background: 'rgba(239,243,255,0.03)',
              border: '1px solid var(--c-line)',
              fontSize: 11.5,
              color: 'var(--c-on-dark-2)',
              lineHeight: 1.5,
            }}
          >
            <div
              className="mono"
              style={{ fontSize: 10, letterSpacing: 0.6, color: 'var(--c-on-dark-3)', marginBottom: 4 }}
            >
              ТРЕБОВАНИЯ
            </div>
            <ul style={{ margin: 0, paddingLeft: 16 }}>
              <li>PNG с прозрачным фоном (лучше всего)</li>
              <li>Квадрат 1:1, минимум 512×512 px</li>
              <li>До 2 МБ, без мелких деталей и тонких линий</li>
              <li>Простой контрастный знак или короткое название</li>
            </ul>
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
            ИМЯ МАСТЕРА
          </div>
          <input
            value={masterName}
            onChange={(e) => setMasterName(e.target.value)}
            placeholder="Керамист Иван Петров"
            style={inputStyle}
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

      {/* Предпочтения */}
      <div style={{ padding: '0 16px 12px' }}>
        <Card kind="dark" pad={16} radius={22}>
          <div
            className="mono"
            style={{ fontSize: 10, letterSpacing: 0.6, color: 'var(--c-on-dark-3)', marginBottom: 12 }}
          >
            ПРЕДПОЧТЕНИЯ
          </div>

          <div style={{ marginBottom: 14 }}>
            <div style={{ fontSize: 13, marginBottom: 8 }}>Стиль по умолчанию</div>
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
          </div>

          <div style={{ height: 1, background: 'var(--c-line)', margin: '4px 0 14px' }} />

          <div>
            <div style={{ fontSize: 13, marginBottom: 8 }}>Размещение логотипа</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {PLACEMENTS.map((p) => (
                <Pill
                  key={p}
                  size="sm"
                  kind={placement === p ? 'accent' : 'ghost'}
                  onClick={() => setPlacement(p)}
                >
                  {PLACEMENT_LABELS[p as keyof typeof PLACEMENT_LABELS]}
                </Pill>
              ))}
            </div>
          </div>
        </Card>
      </div>

      {/* Хэштеги */}
      <div style={{ padding: '0 16px 24px' }}>
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
              ФИРМЕННЫЕ ХЭШТЕГИ · {hashtags.length}
            </div>
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
                Нет хэштегов
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
            }}
          >
            <input
              value={newTag}
              onChange={(e) => setNewTag(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && addTag(newTag)}
              placeholder="#новый_хэштег"
              style={{ ...inputStyle, padding: 0, fontSize: 13 }}
            />
            <CircleBtn size={26} kind="accent" onClick={() => addTag(newTag)}>
              <IconPlus size={14} />
            </CircleBtn>
          </div>
        </Card>
      </div>
    </Screen>
  );
}
