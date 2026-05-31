import { useRef, useState } from 'react';
import { Screen } from '../components/Screen';
import { ScreenIntro } from '../components/ScreenIntro';
import { StepBadge } from '../components/StepBadge';
import { Card } from '../components/primitives/Card';
import { CircleBtn } from '../components/primitives/CircleBtn';
import {
  IconCam,
  IconHistory,
  IconImg,
  IconSpark,
} from '../components/primitives/icons';
import { useApp } from '../state/AppContext';
import { useMainButton } from '../telegram/useMainButton';
import { useBackButton } from '../telegram/useBackButton';
import { useRouter } from '../router/Router';
import { api, friendlyError, isBackendReady } from '../api/client';

export function ScreenUpload() {
  const { draft, setDraft } = useApp();
  const { push, back } = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [picked, setPicked] = useState<boolean>(Boolean(draft.photo?.photoPath));
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<{ title: string; sub: string; raw: string } | null>(null);

  useBackButton(back);
  useMainButton({
    text: uploading ? 'Загружается…' : picked ? 'Далее' : 'Выбрать из галереи',
    onClick: () => {
      if (uploading) return;
      if (picked) {
        push('worktype');
      } else {
        fileRef.current?.click();
      }
    },
    enabled: !uploading,
    progress: uploading,
  });

  const onFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    setError(null);
    setUploading(true);

    // Сразу показываем превью
    const previewUrl = URL.createObjectURL(f);
    setDraft({
      photo: {
        name: f.name,
        size: `${(f.size / (1024 * 1024)).toFixed(1)} МБ`,
        resolution: '—',
        url: previewUrl,
      },
      status: 'photo_uploaded',
    });

    try {
      if (isBackendReady()) {
        const { photoPath } = await api.uploadPhoto(f);
        setDraft({
          photo: {
            name: f.name,
            size: `${(f.size / (1024 * 1024)).toFixed(1)} МБ`,
            resolution: '—',
            url: previewUrl,
            photoPath,
          },
          status: 'photo_uploaded',
        });
      } else {
        // Mock-режим — photoPath = blob URL
        setDraft({
          photo: {
            name: f.name,
            size: `${(f.size / (1024 * 1024)).toFixed(1)} МБ`,
            resolution: '—',
            url: previewUrl,
            photoPath: previewUrl,
          },
        });
      }
      setPicked(true);
    } catch (err) {
      const raw = err instanceof Error ? err.message : String(err);
      setError({ ...friendlyError(raw), raw });
      setPicked(false);
    } finally {
      setUploading(false);
    }
  };

  return (
    <Screen>
      <input
        ref={fileRef}
        type="file"
        accept="image/jpeg,image/png,image/jpg"
        style={{ display: 'none' }}
        onChange={onFile}
      />
      <div style={{ padding: '12px 22px 14px' }}>
        <StepBadge n={1} total={8} />
      </div>
      <ScreenIntro
        title="Загрузите фото вашей работы"
        sub="Лучше всего подойдут фото на модели, без сильного зума, жёлтого света и пересветов."
      />

      <div style={{ padding: '0 16px 16px' }}>
        <div
          role="button"
          tabIndex={0}
          onClick={() => fileRef.current?.click()}
          style={{
            height: 260,
            borderRadius: 28,
            background: 'rgba(239,243,255,0.03)',
            border: '1.5px dashed rgba(147,213,225,0.45)',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 14,
            position: 'relative',
            overflow: 'hidden',
            cursor: 'pointer',
          }}
        >
          <div
            style={{
              position: 'absolute',
              inset: 0,
              opacity: 0.4,
              background:
                'radial-gradient(circle at 50% 40%, rgba(147,213,225,0.18), transparent 60%)',
            }}
          />
          {draft.photo?.url ? (
            <img
              src={draft.photo.url}
              alt="preview"
              style={{
                position: 'absolute',
                inset: 0,
                width: '100%',
                height: '100%',
                objectFit: 'cover',
              }}
            />
          ) : (
            <>
              <CircleBtn size={56} kind="accent">
                <IconImg size={24} />
              </CircleBtn>
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: 15, fontWeight: 600 }}>Перетащите фото сюда</div>
                <div style={{ fontSize: 12, color: 'var(--c-on-dark-2)', marginTop: 4 }}>
                  JPG, PNG · до 20 МБ
                </div>
              </div>
            </>
          )}
        </div>

        <div style={{ display: 'flex', gap: 10, marginTop: 12 }}>
          <Card
            kind="ghost"
            pad={14}
            radius={18}
            onClick={() => fileRef.current?.click()}
            style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 10 }}
          >
            <IconCam size={20} color="var(--c-accent)" />
            <span style={{ fontSize: 13, fontWeight: 500 }}>Снять сейчас</span>
          </Card>
          <Card
            kind="ghost"
            pad={14}
            radius={18}
            style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 10 }}
          >
            <IconHistory size={20} color="var(--c-accent)" />
            <span style={{ fontSize: 13, fontWeight: 500 }}>История</span>
          </Card>
        </div>

        {error && (
          <Card
            kind="dark"
            pad={14}
            radius={18}
            style={{
              marginTop: 12,
              background: 'rgba(232, 155, 126, 0.12)',
              border: '1px solid rgba(232, 155, 126, 0.4)',
            }}
          >
            <div style={{ fontSize: 12.5, fontWeight: 600, color: '#F4B19A', marginBottom: 4 }}>
              {error.title}
            </div>
            <div style={{ fontSize: 11.5, color: 'var(--c-on-dark-2)', lineHeight: 1.4, marginBottom: 10 }}>
              {error.sub}
            </div>
            <div
              role="button"
              tabIndex={0}
              onClick={() => fileRef.current?.click()}
              style={{
                display: 'inline-block',
                padding: '6px 14px',
                borderRadius: 999,
                background: 'rgba(244, 177, 154, 0.18)',
                color: '#F4B19A',
                fontSize: 11.5,
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              Попробовать снова
            </div>
            <details style={{ marginTop: 10 }}>
              <summary style={{ fontSize: 10.5, color: 'var(--c-on-dark-3)', cursor: 'pointer', userSelect: 'none' }}>
                детали для разработчика
              </summary>
              <div
                className="mono"
                style={{
                  marginTop: 6,
                  fontSize: 10,
                  color: 'var(--c-on-dark-3)',
                  lineHeight: 1.4,
                  wordBreak: 'break-all',
                  background: 'rgba(0,0,0,0.25)',
                  padding: 8,
                  borderRadius: 8,
                }}
              >
                {error.raw}
              </div>
            </details>
          </Card>
        )}

        <Card
          kind="dark"
          pad={14}
          radius={18}
          style={{ marginTop: 12, display: 'flex', gap: 12, alignItems: 'flex-start' }}
        >
          <CircleBtn size={32} kind="accent">
            <IconSpark size={14} />
          </CircleBtn>
          <div>
            <div style={{ fontSize: 12.5, fontWeight: 600, marginBottom: 2 }}>
              AI улучшает подачу, не работу
            </div>
            <div style={{ fontSize: 11.5, color: 'var(--c-on-dark-2)', lineHeight: 1.4 }}>
              Меняем фон, свет и кадр. Форма, цвет и анатомия остаются как у вас.
            </div>
          </div>
        </Card>

        {/* Ссылка на «Как снимать» — в контексте, где это реально нужно (перед загрузкой). */}
        <Card
          kind="dark"
          pad={12}
          radius={16}
          onClick={() => push('help')}
          style={{
            marginTop: 10,
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            background: 'rgba(147,213,225,0.06)',
            border: '1px solid rgba(147,213,225,0.18)',
          }}
        >
          <CircleBtn size={28} kind="ghost">
            <IconCam size={14} color="var(--c-accent)" />
          </CircleBtn>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 12.5, fontWeight: 600 }}>Как снимать, чтобы AI лучше отработал</div>
            <div style={{ fontSize: 11, color: 'var(--c-on-dark-2)', marginTop: 1 }}>
              Свет, фокус, ракурс — 7 коротких правил
            </div>
          </div>
          <span style={{ color: 'var(--c-on-dark-3)', fontSize: 14 }}>→</span>
        </Card>
      </div>
    </Screen>
  );
}
