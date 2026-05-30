import { useState, type CSSProperties } from 'react';
import { Screen } from '../components/Screen';
import { useApp } from '../state/AppContext';
import { useRouter } from '../router/Router';
import { useBackButton } from '../telegram/useBackButton';
import { api } from '../api/client';
import { WebApp } from '../telegram/webapp';

const BOT_APP_URL = 'https://t.me/labframe_ai_bot/app';

export function ScreenInvite() {
  const { user } = useApp();
  const { back } = useRouter();
  useBackButton(back);

  const code = user.refCode ?? '';
  const link = code ? `${BOT_APP_URL}?startapp=ref_${code}` : '';

  const [manual, setManual] = useState('');
  const [msg, setMsg] = useState<string | null>(null);

  const copy = async (text: string, label: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setMsg(`${label} скопирован`);
    } catch {
      setMsg('Не удалось скопировать');
    }
  };

  const share = () => {
    if (!link) return;
    const text = 'Делаю посты для зубных работ через ИИ — попробуй, дам бонусные генерации 👇';
    const url = `https://t.me/share/url?url=${encodeURIComponent(link)}&text=${encodeURIComponent(text)}`;
    WebApp?.openTelegramLink?.(url);
  };

  const applyManual = async () => {
    const res = await api.applyReferral({ code: manual });
    if (res.ok && res.already) setMsg('Промокод уже применён');
    else if (res.ok) setMsg('Промокод применён! Бонус — после первой оплаты');
    else setMsg(reasonText(res.reason));
  };

  return (
    <Screen>
      <div style={{ padding: '16px 22px' }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, letterSpacing: -0.3, margin: '0 0 8px' }}>
          Пригласи друга
        </h1>
        <p style={{ color: 'var(--c-on-dark-2)', fontSize: 14, lineHeight: 1.5, margin: 0 }}>
          Друг оплачивает план — ты получаешь бонусные генерации, и друг тоже.
          Приглашения копятся уже сейчас.
        </p>

        <div style={{ marginTop: 22 }}>
          <div style={labelStyle}>Твоя ссылка</div>
          <div style={{ display: 'flex', gap: 8 }}>
            <input readOnly value={link} style={inputStyle} />
            <button onClick={() => copy(link, 'Ссылка')} style={btnStyle} disabled={!link}>Копировать</button>
          </div>
          <button onClick={share} style={{ ...btnStyle, width: '100%', marginTop: 10 }} disabled={!link}>
            Поделиться в Telegram
          </button>
        </div>

        <div style={{ marginTop: 22 }}>
          <div style={labelStyle}>Твой промокод</div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <div style={{ fontSize: 22, fontWeight: 700, letterSpacing: 1 }}>{code || '—'}</div>
            {code && <button onClick={() => copy(code, 'Код')} style={btnStyle}>Копировать</button>}
          </div>
        </div>

        <div style={{ marginTop: 24, display: 'flex', gap: 12 }}>
          <Stat label="Приглашено" value={user.referralsCount ?? 0} />
          <Stat label="Оплатили" value={user.referralsPaid ?? 0} />
        </div>

        <div style={{ marginTop: 24 }}>
          <div style={labelStyle}>Есть промокод друга?</div>
          <div style={{ display: 'flex', gap: 8 }}>
            <input
              value={manual}
              onChange={(e) => setManual(e.target.value)}
              placeholder="ZUB-XXXX"
              style={inputStyle}
            />
            <button onClick={applyManual} style={btnStyle} disabled={!manual.trim()}>Применить</button>
          </div>
        </div>

        {msg && <div style={{ marginTop: 16, fontSize: 13, color: 'var(--c-accent)' }}>{msg}</div>}
      </div>
    </Screen>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div style={{ flex: 1, background: 'var(--c-card-d)', borderRadius: 12, padding: '12px 14px' }}>
      <div style={{ fontSize: 24, fontWeight: 700 }}>{value}</div>
      <div style={{ fontSize: 12, color: 'var(--c-on-dark-2)' }}>{label}</div>
    </div>
  );
}

function reasonText(reason?: string): string {
  switch (reason) {
    case 'self':       return 'Нельзя применить собственный код';
    case 'bad_code':   return 'Код не найден';
    case 'too_old':    return 'Промокод доступен только новым пользователям';
    case 'empty_code': return 'Введите код';
    default:           return 'Не удалось применить код';
  }
}

const labelStyle: CSSProperties = {
  fontSize: 12, color: 'var(--c-on-dark-2)', marginBottom: 6,
};
const inputStyle: CSSProperties = {
  flex: 1, padding: '10px 12px', borderRadius: 10,
  border: '1px solid var(--c-line)', background: 'var(--c-card-d)',
  color: 'var(--c-on-dark)', fontSize: 13,
};
const btnStyle: CSSProperties = {
  padding: '10px 14px', borderRadius: 10, border: 'none',
  background: 'var(--c-accent)', color: 'var(--c-ink)', fontSize: 13, fontWeight: 600, cursor: 'pointer',
};
