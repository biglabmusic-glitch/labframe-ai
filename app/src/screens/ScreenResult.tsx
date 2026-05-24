import { useEffect, useState } from 'react';
import { Screen } from '../components/Screen';
import { Card } from '../components/primitives/Card';
import { Pill } from '../components/primitives/Pill';
import { Tag } from '../components/primitives/Tag';
import {
  IconDownload,
  IconPlus,
  IconRefresh,
  IconShare,
  IconSpark,
  IconTooth,
} from '../components/primitives/icons';
import { useApp } from '../state/AppContext';
import { useMainButton } from '../telegram/useMainButton';
import { useBackButton } from '../telegram/useBackButton';
import { useRouter } from '../router/Router';
import type { FormatId } from '../state/types';
import { WebApp } from '../telegram/webapp';
import { api, isBackendReady } from '../api/client';

const FORMAT_TABS: FormatId[] = ['1x1', '4x5', '9x16'];
const FORMAT_LABEL: Record<FormatId, string> = {
  '1x1': '1:1',
  '4x5': '4:5',
  '9x16': '9:16',
};

export function ScreenResult() {
  const { draft, brand, resetDraft } = useApp();
  const { reset, back } = useRouter();
  const [tab, setTab] = useState<FormatId>(draft.format ?? '1x1');
  const [resultUrl, setResultUrl] = useState<string | null>(null);
  const [caption, setCaption] = useState<{ main: string; hashtags: string[] } | null>(null);

  // Тянем результат с бэка, если job был
  useEffect(() => {
    const jobId = sessionStorage.getItem('labframe.lastJobId');
    if (!jobId || !isBackendReady()) return;
    api.getJob(jobId).then((j) => {
      if (j.resultUrl) setResultUrl(j.resultUrl);
      if (j.caption) setCaption({ main: j.caption.main, hashtags: j.caption.hashtags ?? [] });
    }).catch(() => {});
  }, []);

  useBackButton(back);
  useMainButton({
    text: '⬇ Скачать пост',
    onClick: () => {
      WebApp?.HapticFeedback?.notificationOccurred?.('success');
      // В реальности — fetch ссылки на результат и скачивание
    },
  });

  return (
    <Screen>
      <div
        style={{
          padding: '14px 22px 14px',
          display: 'flex',
          gap: 6,
          alignItems: 'center',
          flexWrap: 'wrap',
        }}
      >
        {FORMAT_TABS.map((t) => (
          <Pill
            key={t}
            size="sm"
            kind={tab === t ? 'accent' : 'ghost'}
            onClick={() => setTab(t)}
          >
            {FORMAT_LABEL[t]}
          </Pill>
        ))}
        <div style={{ flex: 1 }} />
        <Pill size="sm" kind="ghost" icon={<IconRefresh size={14} />}>
          другой стиль
        </Pill>
      </div>

      <div style={{ padding: '0 16px 14px' }}>
        <div style={{ position: 'relative', borderRadius: 24, overflow: 'hidden' }}>
          <div
            style={{
              width: '100%',
              height: 300,
              background:
                draft.style === 'clean'
                  ? '#F4F6FB'
                  : draft.style === 'soft'
                  ? 'linear-gradient(135deg,#D6EEF3 0%,#EFF3FF 100%)'
                  : 'var(--c-bg)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color:
                draft.style === 'dark'
                  ? 'rgba(239,243,255,0.85)'
                  : 'rgba(15,18,33,0.6)',
              overflow: 'hidden',
              position: 'relative',
            }}
          >
            {resultUrl ? (
              <img
                src={resultUrl}
                alt="result"
                style={{ width: '100%', height: '100%', objectFit: 'cover' }}
              />
            ) : draft.photo?.url ? (
              <img
                src={draft.photo.url}
                alt="result"
                style={{ width: '100%', height: '100%', objectFit: 'cover' }}
              />
            ) : (
              <IconTooth size={120} />
            )}
          </div>
          {draft.branding !== 'none' && (
            <div
              style={{
                position: 'absolute',
                bottom: 12,
                right: 12,
                padding: '6px 10px',
                background: 'rgba(255,255,255,0.92)',
                borderRadius: 8,
                fontSize: 9,
                fontWeight: 700,
                letterSpacing: 1,
                color: 'var(--c-ink)',
              }}
            >
              {(brand.masterName ?? 'CERAMIST').toUpperCase()}
            </div>
          )}
          <div
            style={{
              position: 'absolute',
              top: 12,
              left: 12,
              padding: '4px 10px',
              background: 'rgba(15,18,33,0.72)',
              borderRadius: 999,
              fontSize: 10,
              fontWeight: 500,
              color: 'var(--c-on-dark)',
              display: 'flex',
              alignItems: 'center',
              gap: 4,
            }}
          >
            <IconSpark size={10} color="var(--c-accent)" />
            {draft.style === 'clean'
              ? 'Clean White'
              : draft.style === 'soft'
              ? 'Soft Studio'
              : 'Premium Dark'}
          </div>
        </div>
      </div>

      {draft.textType !== 'none' && (
        <div style={{ padding: '0 16px 12px' }}>
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
                style={{
                  fontSize: 10,
                  letterSpacing: 0.6,
                  color: 'var(--c-on-dark-3)',
                }}
              >
                ТЕКСТ К ПОСТУ ·{' '}
                {draft.textType === 'short'
                  ? 'КОРОТКИЙ'
                  : draft.textType === 'tech'
                  ? 'ТЕХНИЧЕСКИЙ'
                  : 'ПРОДАЮЩИЙ'}
              </div>
              <Pill size="sm" kind="ghost" icon={<IconRefresh size={12} />}>
                иначе
              </Pill>
            </div>
            <p style={{ margin: 0, fontSize: 13, lineHeight: 1.5, color: 'var(--c-on-dark)' }}>
              {caption?.main ??
                'В таких работах важна не только форма, но и ощущение естественности: мягкий переход оттенков, правильная текстура и живая игра света помогают реставрации выглядеть гармонично в улыбке.'}
            </p>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 12 }}>
              {(caption?.hashtags?.length ? caption.hashtags : brand.hashtags).slice(0, 8).map((t) => (
                <Tag key={t} kind="ghost" style={{ fontSize: 10.5 }}>
                  {t}
                </Tag>
              ))}
            </div>
          </Card>
        </div>
      )}

      <div
        style={{
          padding: '0 16px 14px',
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          gap: 8,
        }}
      >
        <Card
          kind="ghost"
          pad={12}
          radius={16}
          onClick={() => WebApp?.HapticFeedback?.impactOccurred?.('light')}
          style={{ display: 'flex', alignItems: 'center', gap: 8 }}
        >
          <IconShare size={18} color="var(--c-accent)" />
          <span style={{ fontSize: 13, fontWeight: 500 }}>Поделиться</span>
        </Card>
        <Card
          kind="ghost"
          pad={12}
          radius={16}
          onClick={() => {
            resetDraft();
            reset('upload');
          }}
          style={{ display: 'flex', alignItems: 'center', gap: 8 }}
        >
          <IconPlus size={18} color="var(--c-accent)" />
          <span style={{ fontSize: 13, fontWeight: 500 }}>Новый пост</span>
        </Card>
      </div>

      <div style={{ padding: '0 16px 8px' }}>
        <Pill size="md" kind="dark" icon={<IconDownload size={14} />}>
          Скачивание управляется кнопкой Telegram снизу
        </Pill>
      </div>
    </Screen>
  );
}
