import { useState, type CSSProperties } from 'react';
import { api } from '../api/client';

/**
 * Ввод промокода приглашения.
 *
 * Вынесен в компонент, потому что нужен в трёх местах, и все три — разные
 * моменты, когда человек держит код в голове: онбординг (только пришёл по
 * чужому совету), экран пакетов (собрался платить, а бонус мотивирует) и экран
 * приглашений (зашёл разбираться с рефералами осознанно).
 *
 * Привязку делает бэкенд: все правила — не себе, не дважды, только до первой
 * оплаты — живут в applyReferral и здесь не дублируются.
 */
export function PromoCodeField({
  title = 'Есть промокод друга?',
  hint,
  onApplied,
}: {
  title?: string;
  hint?: string;
  onApplied?: () => void;
}) {
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const [ok, setOk] = useState(false);

  const apply = () => {
    const value = code.trim();
    if (!value || busy) return;
    setBusy(true);
    setMsg('');
    api.applyReferral({ code: value })
      .then((res) => {
        if (res.already) { setOk(true); setMsg('Промокод уже применён'); }
        else if (res.ok) {
          setOk(true);
          setMsg('Промокод применён. Бонус придёт после первой оплаты');
          onApplied?.();
        } else { setOk(false); setMsg(reasonText(res.reason)); }
      })
      .catch(() => { setOk(false); setMsg('Не удалось применить код'); })
      .finally(() => setBusy(false));
  };

  return (
    <div>
      <div style={labelStyle}>{title}</div>
      {hint ? <div style={hintStyle}>{hint}</div> : null}
      <div style={{ display: 'flex', gap: 8 }}>
        <input
          value={code}
          onChange={(e) => setCode(e.target.value)}
          placeholder="ZUB-XXXX"
          autoCapitalize="characters"
          style={inputStyle}
        />
        <button onClick={apply} style={btnStyle} disabled={!code.trim() || busy}>
          {busy ? '…' : 'Применить'}
        </button>
      </div>
      {msg ? (
        <div
          style={{
            marginTop: 8,
            fontSize: 12.5,
            color: ok ? 'var(--c-accent)' : '#F4B19A',
          }}
        >
          {msg}
        </div>
      ) : null}
    </div>
  );
}

function reasonText(reason?: string): string {
  switch (reason) {
    case 'self':         return 'Нельзя применить собственный код';
    case 'bad_code':     return 'Такого кода нет — проверьте написание';
    case 'already_paid': return 'Промокод можно применить только до первой оплаты';
    case 'too_old':      return 'Промокод доступен только новым пользователям';
    case 'empty_code':   return 'Введите код';
    default:             return 'Не удалось применить код';
  }
}

const labelStyle: CSSProperties = {
  fontSize: 12, color: 'var(--c-on-dark-2)', marginBottom: 6,
};
const hintStyle: CSSProperties = {
  fontSize: 12, color: 'var(--c-on-dark-3)', marginBottom: 8, lineHeight: 1.4,
};
const inputStyle: CSSProperties = {
  flex: 1, padding: '10px 12px', borderRadius: 10,
  border: '1px solid var(--c-line)', background: 'var(--c-card-d)',
  color: 'var(--c-on-dark)', fontSize: 13,
};
const btnStyle: CSSProperties = {
  padding: '10px 14px', borderRadius: 10, border: 'none',
  background: 'var(--c-accent)', color: 'var(--c-ink)',
  fontSize: 13, fontWeight: 600, cursor: 'pointer',
};
