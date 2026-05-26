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
import { FONTS, DEFAULT_FONT_ID } from '../lib/fonts';
import { cropToSquareFile } from '../lib/image-crop';

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
  const [fontId, setFontId] = useState<string>(brand.fontId ?? DEFAULT_FONT_ID);
  const [hashLoading, setHashLoading] = useState(false);
  const [hashError, setHashError]     = useState<string | null>(null);

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
        fontId,
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

      // Авто-кроп до квадрата 1024×1024 — даже если юзер выбрал прямоугольное фото,
      // AI получит готовый квадратный лого. Превью обновляем на cropped-версию.
      // Загрузка в Storage идёт уже квадратной картинки.
      if (isBackendReady()) {
        setLogoUploading(true);
        try {
          const squared = await cropToSquareFile(f, 1024);
          // Обновляем превью на cropped (иначе фронт показывает оригинал, а сервер — квадрат).
          const cropUrl = URL.createObjectURL(squared);
          setLogoUrl(cropUrl);
          const { logoPath: newPath } = await api.uploadLogo(squared);
          setLogoPath(newPath);
          // Кроп прошёл успешно → ratio-предупреждение из onload-валидации больше не релевантно.
          setLogoWarn(null);
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

  const regenerateHashtags = async () => {
    if (!isBackendReady() || hashLoading) return;
    setHashError(null);
    setHashLoading(true);
    try {
      const { hashtags: fresh } = await api.regenBrandHashtags();
      if (fresh?.length) setHashtags(fresh);
    } catch (err) {
      setHashError(err instanceof Error ? err.message : 'не удалось сгенерировать');
    } finally {
      setHashLoading(false);
    }
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
              <li>Можно прямоугольное — мы сами обрежем по центру до квадрата</li>
              <li>Минимум 512×512 px по короткой стороне, до 2 МБ</li>
              <li>Простой контрастный знак или короткое название без мелких деталей</li>
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

      {/* Шрифт подписи: горизонтальный скролл с превью.
          Каждая карточка рендерит реальное имя мастера/лабы выбранным шрифтом. */}
      <div style={{ padding: '0 16px 12px' }}>
        <Card kind="dark" pad={16} radius={22}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
            <div
              className="mono"
              style={{ fontSize: 10, letterSpacing: 0.6, color: 'var(--c-on-dark-3)' }}
            >
              ШРИФТ ПОДПИСИ
            </div>
            <div style={{ fontSize: 10.5, color: 'var(--c-on-dark-3)' }}>
              AI учтёт в стиле работы
            </div>
          </div>
          <div
            className="no-scrollbar"
            // На десктопе у юзера нет touch-скролла, а полоса скрыта — крутим колесом мыши:
            // вертикальный wheel превращаем в горизонтальный scrollLeft.
            onWheel={(e) => {
              if (e.deltaY === 0) return;
              e.currentTarget.scrollLeft += e.deltaY;
            }}
            style={{
              display: 'flex',
              gap: 8,
              overflowX: 'auto',
              marginLeft: -4,
              marginRight: -4,
              padding: '0 4px',
              scrollBehavior: 'smooth',
            }}
          >
            {FONTS.map((f) => {
              const active = fontId === f.id;
              const sample = masterName.trim() || labName.trim() || 'Slava Lab';
              return (
                <button
                  key={f.id}
                  type="button"
                  onClick={() => setFontId(f.id)}
                  style={{
                    flex: '0 0 auto',
                    minWidth: 140,
                    padding: '12px 14px',
                    borderRadius: 14,
                    border: active ? '2px solid var(--c-accent)' : '1px solid var(--c-line)',
                    background: active ? 'rgba(147,213,225,0.08)' : 'rgba(239,243,255,0.03)',
                    cursor: 'pointer',
                    color: 'var(--c-on-dark)',
                    textAlign: 'left',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 6,
                  }}
                >
                  <div
                    style={{
                      fontFamily: f.cssFamily,
                      fontSize: 18,
                      fontWeight: 500,
                      letterSpacing: f.category === 'display' ? 1 : -0.2,
                      lineHeight: 1.1,
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      color: active ? 'var(--c-on-dark)' : 'var(--c-on-dark-2)',
                    }}
                  >
                    {sample}
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                    <div
                      className="mono"
                      style={{ fontSize: 9, letterSpacing: 0.5, color: active ? 'var(--c-accent)' : 'var(--c-on-dark-3)' }}
                    >
                      {f.label.toUpperCase()}
                    </div>
                    <div style={{ fontSize: 10, color: 'var(--c-on-dark-3)' }}>{f.hint}</div>
                  </div>
                </button>
              );
            })}
          </div>
        </Card>
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
              gap: 8,
            }}
          >
            <div
              className="mono"
              style={{ fontSize: 10, letterSpacing: 0.6, color: 'var(--c-on-dark-3)' }}
            >
              ФИРМЕННЫЕ ХЭШТЕГИ · {hashtags.length}
            </div>
            <button
              type="button"
              onClick={regenerateHashtags}
              disabled={hashLoading}
              style={{
                padding: '6px 12px',
                borderRadius: 999,
                border: '1px solid rgba(147,213,225,0.35)',
                background: 'rgba(147,213,225,0.1)',
                color: 'var(--c-accent)',
                fontSize: 11,
                fontWeight: 600,
                letterSpacing: -0.1,
                cursor: hashLoading ? 'default' : 'pointer',
                opacity: hashLoading ? 0.55 : 1,
                whiteSpace: 'nowrap',
              }}
            >
              {hashLoading ? '⏳ генерируем…' : '✨ Сгенерировать под бренд'}
            </button>
          </div>

          {hashError && (
            <div
              style={{
                marginBottom: 10,
                padding: '6px 10px',
                borderRadius: 10,
                background: 'rgba(244,177,154,0.10)',
                border: '1px solid rgba(244,177,154,0.30)',
                fontSize: 11,
                color: '#F4B19A',
              }}
            >
              {hashError}
            </div>
          )}

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
