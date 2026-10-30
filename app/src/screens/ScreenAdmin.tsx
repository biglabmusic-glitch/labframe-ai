import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react';
import { Screen } from '../components/Screen';
import { ScreenIntro } from '../components/ScreenIntro';
import { Card } from '../components/primitives/Card';
import { useBackButton } from '../telegram/useBackButton';
import { useMainButton } from '../telegram/useMainButton';
import { useRouter } from '../router/Router';
import { api, type AdminGrant, type AdminPayment, type AdminSmileInvite, type AdminStats, type AdminUser, type CreatedSmileInvite } from '../api/client';
import { WebApp } from '../telegram/webapp';

type Tab = 'dashboard' | 'money' | 'users' | 'smile';
const ADMIN_TABS: Array<{ id: Tab; label: string }> = [
  { id: 'smile', label: 'Тест улыбки' }, { id: 'dashboard', label: 'Дашборд' },
  { id: 'money', label: 'Деньги' }, { id: 'users', label: 'Юзеры' },
];

export function ScreenAdmin() {
  const { back } = useRouter();
  const [tab, setTab] = useState<Tab>('dashboard');
  useBackButton(back);
  useMainButton(null);

  return (
    <Screen>
      <ScreenIntro title="Админка" sub="Мониторинг + управление юзерами." />

      <div
        className="no-scrollbar"
        role="tablist" aria-label="Разделы админки"
        style={{ padding: '0 22px 14px', display: 'flex', flexWrap: 'wrap', gap: 6 }}
      >
        {ADMIN_TABS.map((item, index) => <button key={item.id} id={`admin-tab-${item.id}`} type="button"
          role="tab" aria-selected={tab === item.id} aria-controls="admin-tab-panel"
          tabIndex={tab === item.id ? 0 : -1}
          onKeyDown={(event) => {
            const next = event.key === 'ArrowRight' ? (index + 1) % ADMIN_TABS.length :
              event.key === 'ArrowLeft' ? (index + ADMIN_TABS.length - 1) % ADMIN_TABS.length :
              event.key === 'Home' ? 0 : event.key === 'End' ? ADMIN_TABS.length - 1 : -1;
            if (next < 0) return;
            event.preventDefault();
            const id = ADMIN_TABS[next].id;
            setTab(id);
            document.getElementById(`admin-tab-${id}`)?.focus();
          }}
          onClick={() => setTab(item.id)} style={{ minHeight: 40, padding: '8px 13px', borderRadius: 999,
            border: `1px solid ${tab === item.id || item.id === 'smile' ? 'var(--c-accent)' : 'var(--c-line)'}`,
            background: tab === item.id ? 'var(--c-accent)' : 'rgba(239,243,255,0.06)',
            color: tab === item.id ? 'var(--c-ink)' : item.id === 'smile' ? 'var(--c-accent)' : 'var(--c-on-dark)',
            fontFamily: 'inherit', fontSize: 12, fontWeight: item.id === 'smile' ? 700 : 500, cursor: 'pointer' }}>
          {item.label}
        </button>)}
      </div>

      <div id="admin-tab-panel" role="tabpanel" aria-labelledby={`admin-tab-${tab}`} tabIndex={0}>
        {tab === 'smile' ? <SmileInvitesTab /> : tab === 'dashboard' ? <DashboardTab /> : tab === 'money' ? <MoneyTab /> : <UsersTab />}
      </div>
    </Screen>
  );
}

const INVITE_BUTTON: CSSProperties = {
  minHeight: 44, padding: '10px 13px', borderRadius: 12, border: '1px solid var(--c-line)',
  background: 'rgba(147,213,225,0.08)', color: 'var(--c-accent)', fontFamily: 'inherit',
  fontSize: 12, fontWeight: 600, cursor: 'pointer',
};
const INVITE_INPUT: CSSProperties = {
  boxSizing: 'border-box', width: '100%', minHeight: 44, padding: '11px 12px', borderRadius: 10,
  border: '1px solid var(--c-line)', background: 'var(--c-bg-2)', color: 'var(--c-on-dark)',
  fontFamily: 'inherit', fontSize: 13,
};
const INVITE_STATES: Record<AdminSmileInvite['status'], string> = {
  active: 'Ожидает активации', used: 'Использовано', revoked: 'Отозвано', expired: 'Срок истёк',
};

function inviteDate(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleString('ru-RU', {
    day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Moscow',
  });
}

function SmileInvitesTab() {
  const [items, setItems] = useState<AdminSmileInvite[]>([]);
  const [label, setLabel] = useState('');
  const [created, setCreated] = useState<CreatedSmileInvite | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [listError, setListError] = useState('');
  const [copyNote, setCopyNote] = useState('');
  const linkInput = useRef<HTMLInputElement>(null);
  const mounted = useRef(false);
  const mutation = useRef(false);
  const listRevision = useRef(0);

  const reload = useCallback(async () => {
    const revision = ++listRevision.current;
    setLoading(true); setListError('');
    try {
      const response = await api.adminSmileInvites();
      if (mounted.current && revision === listRevision.current) {
        setItems(response.items);
        setCreated((current) => {
          if (!current) return null;
          const updated = response.items.find((item) => item.id === current.id);
          return updated && (updated.status !== 'active' || new Date(updated.expiresAt).getTime() <= Date.now()) ? null : current;
        });
      }
    } catch {
      if (mounted.current && revision === listRevision.current) {
        setListError('Не удалось загрузить приглашения. Попробуйте обновить список.');
      }
    } finally {
      if (mounted.current && revision === listRevision.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    mounted.current = true;
    void reload();
    return () => { mounted.current = false; listRevision.current++; };
  }, [reload]);

  async function createInvite() {
    if (mutation.current) return;
    mutation.current = true;
    setBusy('create'); setError(''); setCopyNote('');
    try {
      const invite = await api.adminCreateSmileInvite(label.trim() || undefined);
      if (!mounted.current) return;
      setCreated(invite); setLabel('');
      await reload();
    } catch (err) {
      if (mounted.current) setError(err instanceof Error && !/fetch|network|abort|timeout/i.test(err.message)
        ? err.message : 'Ответ на создание не получен. Обновите список: приглашение могло уже появиться.');
    } finally {
      mutation.current = false;
      if (mounted.current) setBusy(null);
    }
  }

  async function revokeInvite(inviteId: string) {
    if (mutation.current) return;
    mutation.current = true;
    setBusy(inviteId); setError('');
    try {
      await api.adminRevokeSmileInvite(inviteId);
      if (!mounted.current) return;
      if (created?.id === inviteId) { setCreated(null); setCopyNote(''); }
      await reload();
    } catch {
      if (mounted.current) setError('Не удалось отозвать приглашение. Обновите список и попробуйте ещё раз.');
    } finally {
      mutation.current = false;
      if (mounted.current) setBusy(null);
    }
  }

  async function copyInvite() {
    if (!created) return;
    try {
      if (!navigator.clipboard?.writeText) throw new Error('clipboard_unavailable');
      await navigator.clipboard.writeText(created.url);
      if (mounted.current) setCopyNote('Ссылка скопирована. Отправьте её одному стоматологу.');
    } catch {
      if (!mounted.current) return;
      linkInput.current?.focus();
      linkInput.current?.select();
      setCopyNote('Ссылка выделена. Скопируйте её через меню устройства.');
    }
  }

  function shareInvite() {
    if (!created) return;
    const shareUrl = `https://t.me/share/url?url=${encodeURIComponent(created.url)}&text=${encodeURIComponent('Приглашаю в бесплатный закрытый тест «Примерить улыбку» в LabFrame. Откройте ссылку в Telegram — доступ появится автоматически. Будем рады вашей обратной связи. Ссылка для одного участника.')}`;
    if (WebApp?.openTelegramLink) WebApp.openTelegramLink(shareUrl);
    else window.open(shareUrl, '_blank', 'noopener,noreferrer');
  }

  return <div style={{ padding: '0 16px 24px', display: 'flex', flexDirection: 'column', gap: 14 }}>
    <Card kind="dark" pad={16} radius={16}>
      <h2 style={{ margin: '0 0 9px', fontSize: 18, fontWeight: 600 }}>Пригласить стоматолога</h2>
      <p style={{ margin: '0 0 15px', fontSize: 12, lineHeight: 1.6, color: 'var(--c-on-dark-2)' }}>
        Создайте персональную ссылку и отправьте знакомому. При открытии в Telegram участник получит доступ к «Примерить улыбку» без прав администратора.
      </p>
      <label htmlFor="smile-invite-label" style={{ display: 'block', marginBottom: 7, fontSize: 12, color: 'var(--c-on-dark-2)' }}>
        Метка приглашения <span style={{ color: 'var(--c-on-dark-3)' }}>· необязательно</span>
      </label>
      <input id="smile-invite-label" value={label} maxLength={80} disabled={busy !== null}
        onChange={(event) => setLabel(event.target.value)} placeholder="Например: доктор Алексей"
        autoComplete="off" style={INVITE_INPUT} />
      <p style={{ margin: '10px 0 14px', fontSize: 11, lineHeight: 1.6, color: 'var(--c-on-dark-3)' }}>
        Ссылка одноразовая и действует 7 дней. Доступ получает первый открывший её Telegram-аккаунт — отправляйте лично.
      </p>
      <button type="button" disabled={busy !== null} onClick={() => void createInvite()}
        style={{ ...INVITE_BUTTON, width: '100%', background: 'var(--c-accent)', color: 'var(--c-ink)', opacity: busy !== null ? 0.5 : 1 }}>
        {busy === 'create' ? 'Создаём приглашение…' : 'Создать приглашение'}
      </button>
      {error && <p role="alert" style={{ margin: '12px 0 0', color: '#F4B19A', fontSize: 12, lineHeight: 1.5 }}>{error}</p>}
    </Card>

    {created && <Card kind="dark" pad={16} radius={16}>
      <h3 style={{ margin: '0 0 8px', color: 'var(--c-accent)', fontSize: 15 }}>Приглашение готово</h3>
      <p style={{ margin: '0 0 12px', color: 'var(--c-on-dark-2)', fontSize: 12, lineHeight: 1.5 }}>
        {created.label ? `${created.label} · ` : ''}Действует до {inviteDate(created.expiresAt)} МСК.
      </p>
      <label htmlFor="smile-invite-url" style={{ display: 'block', marginBottom: 7, fontSize: 12 }}>Ссылка для участника</label>
      <input id="smile-invite-url" ref={linkInput} type="text" readOnly value={created.url}
        onFocus={(event) => event.currentTarget.select()} autoComplete="off" spellCheck={false}
        style={{ ...INVITE_INPUT, fontSize: 11 }} />
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 10 }}>
        <button type="button" onClick={() => void copyInvite()} style={{ ...INVITE_BUTTON, flex: '1 1 130px' }}>Скопировать ссылку</button>
        <button type="button" onClick={shareInvite} style={{ ...INVITE_BUTTON, flex: '1 1 130px' }}>Поделиться в Telegram</button>
      </div>
      <p aria-live="polite" role="status" style={{ margin: '10px 0 0', color: 'var(--c-accent)', fontSize: 11, lineHeight: 1.5 }}>{copyNote}</p>
      <p style={{ margin: '10px 0 0', color: 'var(--c-on-dark-3)', fontSize: 11, lineHeight: 1.6 }}>
        Скопируйте ссылку перед уходом с вкладки или созданием следующей. Повторно показать её из списка нельзя.
      </p>
    </Card>}

    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
      <h2 style={{ margin: 0, fontSize: 15, fontWeight: 600 }}>Последние приглашения</h2>
      <button type="button" disabled={loading || busy !== null} onClick={() => void reload()}
        style={{ ...INVITE_BUTTON, minHeight: 40, padding: '8px 11px', opacity: loading || busy !== null ? 0.5 : 1 }}>
        {loading ? 'Загружаем…' : 'Обновить'}
      </button>
    </div>
    {listError && <p role="alert" style={{ margin: 0, color: '#F4B19A', fontSize: 12, lineHeight: 1.5 }}>{listError}</p>}
    {loading && items.length === 0 ? <Hint text="Загружаем приглашения…" /> : !listError && items.length === 0 ?
      <Hint text="Приглашений пока нет. Создайте первое выше." /> : items.map((invite) => {
        const status = invite.status === 'active' && new Date(invite.expiresAt).getTime() <= Date.now() ? 'expired' : invite.status;
        return <Card key={invite.id} kind="dark" pad={14} radius={14}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10 }}>
            <strong style={{ minWidth: 0, overflowWrap: 'anywhere', fontSize: 13 }}>{invite.label || 'Без метки'}</strong>
            <span style={{ flexShrink: 0, fontSize: 10, lineHeight: 1.7, color: status === 'active' ? 'var(--c-accent)' : 'var(--c-on-dark-3)' }}>
              {INVITE_STATES[status]}
            </span>
          </div>
          <p style={{ margin: '8px 0 0', color: 'var(--c-on-dark-3)', fontSize: 11, lineHeight: 1.7 }}>
            Создано {inviteDate(invite.createdAt)} МСК<br />
            {status === 'used' && invite.usedAt ? `Активировано ${inviteDate(invite.usedAt)} МСК${invite.usedBy ? ` · id ${invite.usedBy}` : ''}` :
              status === 'revoked' && invite.revokedAt ? `Отозвано ${inviteDate(invite.revokedAt)} МСК` : `Действует до ${inviteDate(invite.expiresAt)} МСК`}
          </p>
          {status === 'active' && <button type="button" disabled={busy !== null} onClick={() => void revokeInvite(invite.id)}
            aria-label={`Отозвать приглашение ${invite.label || 'без метки'}`}
            style={{ ...INVITE_BUTTON, marginTop: 10, color: '#F4B19A', opacity: busy !== null ? 0.5 : 1 }}>
            {busy === invite.id ? 'Отзываем…' : 'Отозвать приглашение'}
          </button>}
        </Card>;
      })}
    <p style={{ margin: 0, fontSize: 11, lineHeight: 1.6, color: 'var(--c-on-dark-3)' }}>
      Отзыв ссылки останавливает новую активацию. Доступ уже приглашённого участника можно закрыть в разделе «Юзеры».
    </p>
  </div>;
}

// ─── Деньги ────────────────────────────────────────────────────────────────
// История покупок и выручка. Нужна, чтобы разбирать споры «я платил, ничего
// не пришло» и видеть, какой пакет реально берут.
function MoneyTab() {
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [items, setItems] = useState<AdminPayment[]>([]);
  const [err, setErr] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    Promise.all([api.adminStats(), api.adminPayments(100)])
      .then(([s, p]) => {
        if (cancelled) return;
        setStats(s);
        setItems(p.payments);
      })
      .catch((e) => { if (!cancelled) setErr(e instanceof Error ? e.message : String(e)); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  if (loading) return <Hint text="Загружаем платежи..." />;
  if (err) return <Hint text={err} error />;
  if (!stats) return null;

  return (
    <div style={{ padding: '0 16px 20px', display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
        <Kpi label="ВЫРУЧКА ВСЕГО" value={money(stats.revenueTotal)} sub={`${stats.paymentsTotal} платежей`} />
        <Kpi label="ВЫРУЧКА 30Д" value={money(stats.revenue30d)} sub={`${stats.payments30d} платежей`} />
        <Kpi label="ВЫРУЧКА 7Д" value={money(stats.revenue7d)} />
        <Kpi label="СРЕДНИЙ ЧЕК" value={money(stats.avgCheck)} sub="за всё время" />
        <Kpi label="ПРОДАНО ГЕНЕРАЦИЙ" value={stats.creditsSold} />
      </div>

      <SectionTitle>Расходы на модели</SectionTitle>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
        <Kpi
          label="ОСТАТОК POLZA"
          value={stats.providerBalance === null ? '—' : money(Math.round(stats.providerBalance))}
          sub={stats.providerBalance === null ? 'нет замеров' : balanceSub(stats)}
        />
        <Kpi
          label="МАРЖА ВСЕГО"
          value={stats.marginTotal === null ? '—' : money(Math.round(stats.marginTotal))}
          sub="выручка минус модели"
        />
        <Kpi
          label="ПОТРАЧЕНО ВСЕГО"
          value={stats.providerSpentTotal === null ? '—' : money(Math.round(stats.providerSpentTotal))}
          sub="за всё время"
        />
        <Kpi label="ПОТРАЧЕНО 30Д" value={period(stats.providerSpent30d)} />
        <Kpi label="ПОТРАЧЕНО 7Д" value={period(stats.providerSpent7d)} />
        <Kpi label="ПОПОЛНЕНО 30Д" value={period(stats.providerToppedUp30d)} />
      </div>
      <SectionTitle>Воронка</SectionTitle>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
        <Kpi
          label="ДОШЛИ ДО ГЕНЕРАЦИИ"
          value={stats.activated}
          sub={pct(stats.activated, stats.totalUsers, 'от всех')}
        />
        <Kpi
          label="НИ РАЗУ НЕ ПРОБОВАЛИ"
          value={stats.neverGenerated}
          sub={pct(stats.neverGenerated, stats.totalUsers, 'от всех')}
        />
        <Kpi
          label="БАЛАНС КОНЧИЛСЯ"
          value={stats.zeroCredits}
          sub="упёрлись в оплату"
        />
        <Kpi
          label="ЗАПЛАТИЛИ"
          value={stats.payers}
          sub={pct(stats.payers, stats.activated, 'от попробовавших')}
        />
        <Kpi
          label="ПО ПРИГЛАШЕНИЮ"
          value={stats.referredCount}
          sub={`${stats.referralPaidCount} из них заплатили`}
        />
      </div>
      <div style={{ fontSize: 11.5, color: 'var(--c-on-dark-3)', lineHeight: 1.45 }}>
        Путь человека: зарегистрировался → сделал первую работу → израсходовал
        баланс → заплатил. Самый важный переход — от «баланс кончился» к
        «заплатил»: он показывает, готовы ли платить те, кто уже попробовал.
      </div>

      {stats.funnel && <FunnelMessages funnel={stats.funnel} />}

      <SectionTitle>Настоящая экономика</SectionTitle>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
        <Kpi
          label="ЧИСТЫМИ"
          value={stats.netTotal === null ? '—' : money(stats.netTotal)}
          sub="минус модели, комиссия, налог"
        />
        <Kpi
          label="СЕБЕСТОИМОСТЬ ГЕНЕРАЦИИ"
          value={stats.costPerGeneration === null ? '—' : `${stats.costPerGeneration} ₽`}
          sub={`${stats.doneTotal} работ всего`}
        />
        <Kpi label="КОМИССИЯ ПРОДАМУСА" value={money(stats.commissionTotal)} />
        <Kpi label="НАЛОГ НПД 4%" value={money(stats.taxTotal)} />
        <Kpi
          label="СЪЕЛИ БЕСПЛАТНЫЕ"
          value={stats.freeSpend === null ? '—' : money(stats.freeSpend)}
          sub={`${stats.freeDone} работ у неплатящих`}
        />
      </div>
      <div style={{ fontSize: 11.5, color: 'var(--c-on-dark-3)', lineHeight: 1.45 }}>
        Себестоимость — расход на модели, делённый на число готовых работ. «Съели
        бесплатные» посчитано по этой средней: точной цены каждой работы провайдер
        не отдаёт. Хостинг пока бесплатный и в расчёт не входит.
      </div>

      {stats.providerError ? (
        <div style={{ fontSize: 11.5, color: '#F4B19A', lineHeight: 1.45, wordBreak: 'break-word' }}>
          Остаток не снимается: {stats.providerError}
        </div>
      ) : null}
      <div style={{ fontSize: 11.5, color: 'var(--c-on-dark-3)', lineHeight: 1.45 }}>
        {stats.providerSpent30d === null
          ? 'Потрачено и маржа за всё время приходят от провайдера сразу. Разбивка по неделям появится, когда накопится второй замер.'
          : 'Маржа считается только по расходу на модели. Хостинг, комиссия Продамуса и налог сюда не входят.'}
      </div>

      <SectionTitle>История покупок</SectionTitle>
      <Card kind="dark" pad={12} radius={16}>
        {items.length === 0 ? (
          <div style={{ fontSize: 12, color: 'var(--c-on-dark-3)' }}>Покупок пока не было</div>
        ) : (
          items.map((p, i) => (
            <div
              key={p.orderId}
              style={{
                padding: '8px 0',
                borderBottom: i < items.length - 1 ? '1px solid var(--c-line)' : 'none',
                fontSize: 12,
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                <span style={{ fontWeight: 600 }}>
                  {p.firstName ?? 'без имени'}
                  {p.username ? ` @${p.username}` : ''}
                </span>
                <span style={{ fontWeight: 700 }}>{money(p.amountRub)}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, marginTop: 2 }}>
                <span style={{ color: 'var(--c-on-dark-2)' }}>
                  {p.credits} генераций · id {p.userId}
                </span>
                <span style={{ color: 'var(--c-on-dark-3)', fontSize: 10 }}>
                  {new Date(p.createdAt).toLocaleString('ru-RU', { dateStyle: 'short', timeStyle: 'short' })}
                </span>
              </div>
            </div>
          ))
        )}
      </Card>
    </div>
  );
}

// ─── Dashboard ─────────────────────────────────────────────────────────────
function DashboardTab() {
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const reload = async () => {
    setLoading(true);
    setErr(null);
    try { setStats(await api.adminStats()); }
    catch (e) { setErr(e instanceof Error ? e.message : 'error'); }
    finally { setLoading(false); }
  };

  useEffect(() => { reload(); }, []);

  if (loading && !stats) return <Hint text="Загружаем статистику..." />;
  if (err) return <Hint text={err} error />;
  if (!stats) return null;

  return (
    <div style={{ padding: '0 16px 20px', display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
        <Kpi label="ВСЕГО ЮЗЕРОВ" value={stats.totalUsers} sub={`+${stats.newUsers7d} за неделю`} />
        <Kpi label="JOBS 7Д" value={stats.jobs7d} sub={`${stats.successRate7d}% успешных`} />
        <Kpi
          label="ОЦЕНКИ 30Д"
          value={stats.likeRate30d == null ? '—' : `${stats.likeRate30d}%`}
          sub="👍 от всех с фидбэком"
        />
        <Kpi label="ТОКЕНЫ 7Д" value={shortNum(stats.tokens7d)} sub="Polza prompt+completion" />
        <Kpi label="ВЫРУЧКА ВСЕГО" value={money(stats.revenueTotal)} sub={`${stats.paymentsTotal} платежей`} />
        <Kpi label="ВЫРУЧКА 30Д" value={money(stats.revenue30d)} sub={`за 7 дней ${money(stats.revenue7d)}`} />
      </div>

      <SectionTitle>Jobs по дням (14 дней)</SectionTitle>
      <BarChart data={stats.byDay} />

      <SectionTitle>Самые активные (7 дней)</SectionTitle>
      <Card kind="dark" pad={12} radius={16}>
        {stats.topUsers.length === 0 ? (
          <div style={{ fontSize: 12, color: 'var(--c-on-dark-3)' }}>Пока пусто</div>
        ) : (
          stats.topUsers.map((u, i) => (
            <div key={u.userId} style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', fontSize: 12.5 }}>
              <span style={{ color: 'var(--c-on-dark-2)' }}>{i + 1}. id {u.userId}</span>
              <span style={{ color: 'var(--c-accent)', fontWeight: 600 }}>{u.jobs} jobs</span>
            </div>
          ))
        )}
      </Card>

      <SectionTitle>Упавшие работы (7 дней)</SectionTitle>
      <Card kind="dark" pad={12} radius={16}>
        {stats.recentFailures.length === 0 ? (
          <div style={{ fontSize: 12, color: 'var(--c-on-dark-3)' }}>Ни одна работа не упала</div>
        ) : (
          stats.recentFailures.map((f, i) => (
            <div
              key={f.id}
              style={{
                padding: '6px 0',
                borderBottom: i < stats.recentFailures.length - 1 ? '1px solid var(--c-line)' : 'none',
                fontSize: 11.5,
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                <span style={{ color: '#F4B19A', fontWeight: 600 }}>
                  {f.first_name ?? `id ${f.user_id}`}
                  {f.username ? ` @${f.username}` : ''}
                </span>
                <span style={{ color: 'var(--c-on-dark-3)', fontSize: 10 }}>
                  {new Date(f.created_at).toLocaleString('ru-RU', { dateStyle: 'short', timeStyle: 'short' })}
                </span>
              </div>
              <div style={{ color: 'var(--c-on-dark-2)', marginTop: 2, wordBreak: 'break-word' }}>
                {(f.error_message ?? 'без причины').slice(0, 200)}
              </div>
              <ProfileButton userId={f.user_id} username={f.username} compact />
            </div>
          ))
        )}
      </Card>

      <div style={{ fontSize: 11.5, color: 'var(--c-on-dark-3)', padding: '2px 2px 0' }}>
        Откат агента на стандартный промт за 7 дней: <b>{stats.agentFallback7d}</b>. Это не сбой —
        работа доходит до конца, теряется только подстройка под бренд.
      </div>

      <SectionTitle>Последние ошибки сервисов</SectionTitle>
      <Card kind="dark" pad={12} radius={16}>
        {stats.recentErrors.length === 0 ? (
          <div style={{ fontSize: 12, color: 'var(--c-on-dark-3)' }}>Ошибок нет</div>
        ) : (
          stats.recentErrors.map((e, i) => (
            <div
              key={i}
              style={{
                padding: '6px 0',
                borderBottom: i < stats.recentErrors.length - 1 ? '1px solid var(--c-line)' : 'none',
                fontSize: 11.5,
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                <span style={{ color: '#F4B19A', fontWeight: 600 }}>{e.provider}</span>
                <span style={{ color: 'var(--c-on-dark-3)', fontSize: 10 }}>
                  {new Date(e.created_at).toLocaleString('ru-RU', { dateStyle: 'short', timeStyle: 'short' })}
                </span>
              </div>
              <div style={{ color: 'var(--c-on-dark-2)', marginTop: 2, wordBreak: 'break-word' }}>
                {(e.error ?? '').slice(0, 200)}
              </div>
            </div>
          ))
        )}
      </Card>

      <button
        type="button"
        onClick={reload}
        disabled={loading}
        style={{
          padding: '10px 14px',
          borderRadius: 12,
          background: 'rgba(147,213,225,0.1)',
          border: '1px solid rgba(147,213,225,0.28)',
          color: 'var(--c-accent)',
          fontSize: 12.5,
          fontWeight: 600,
          cursor: loading ? 'default' : 'pointer',
          opacity: loading ? 0.6 : 1,
        }}
      >
        {loading ? '⏳ обновляем…' : '↻ Обновить'}
      </button>
    </div>
  );
}

// ─── Users ─────────────────────────────────────────────────────────────────
function UsersTab() {
  const [items, setItems] = useState<AdminUser[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<AdminUser | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [more, setMore] = useState(false);
  const [total, setTotal] = useState(0);
  const sentinel = useRef<HTMLDivElement | null>(null);

  const reload = async (q: string = search) => {
    setLoading(true);
    try {
      const r = await api.adminUsers(q.trim() || undefined);
      setItems(r.items);
      setHasMore(r.hasMore);
      setTotal(r.total);
    } catch { /* ignore */ }
    finally { setLoading(false); }
  };

  // Подгрузка следующей страницы. Пятьсот человек в один список не влезают,
  // а найти конкретного нужно не только поиском: иногда просто листаешь.
  const loadMore = async () => {
    setMore(true);
    try {
      const r = await api.adminUsers(search.trim() || undefined, items.length);
      setItems((prev) => [...prev, ...r.items]);
      setHasMore(r.hasMore);
      setTotal(r.total);
    } catch { /* ignore */ }
    finally { setMore(false); }
  };

  useEffect(() => { reload(''); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);

  // Следим за маячком в конце списка: попал в поле зрения — грузим дальше.
  // Пересоздаём наблюдателя при каждом изменении списка, потому что после
  // подгрузки маячок уезжает вниз и прежняя подписка становится бесполезной.
  useEffect(() => {
    const node = sentinel.current;
    if (!node || !hasMore || more || loading) return;
    if (typeof IntersectionObserver === 'undefined') return;

    const io = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) loadMore();
    }, { rootMargin: '200px' });  // начинаем заранее, чтобы не дёргалось
    io.observe(node);
    return () => io.disconnect();
    /* eslint-disable-next-line react-hooks/exhaustive-deps */
  }, [items.length, hasMore, more, loading]);

  return (
    <div style={{ padding: '0 16px 20px', display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div
        style={{
          display: 'flex',
          gap: 8,
          padding: '8px 12px',
          borderRadius: 12,
          background: 'rgba(239,243,255,0.04)',
          border: '1px solid var(--c-line)',
        }}
      >
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && reload()}
          placeholder="имя, username или id"
          style={{
            flex: 1, background: 'transparent', border: 'none', outline: 'none',
            color: 'var(--c-on-dark)', fontSize: 13, fontFamily: 'inherit',
          }}
        />
        <button
          type="button"
          onClick={() => reload()}
          style={{
            padding: '4px 10px', borderRadius: 8, background: 'var(--c-accent)',
            color: 'var(--c-ink)', border: 'none', fontSize: 11, fontWeight: 700, cursor: 'pointer',
          }}
        >Найти</button>
      </div>

      {loading && items.length === 0 ? (
        <Hint text="Загружаем юзеров..." />
      ) : items.length === 0 ? (
        <Hint text="Не нашли никого" />
      ) : items.map((u) => (
        <button
          key={u.id}
          type="button"
          onClick={() => setSelected(u)}
          style={{
            textAlign: 'left',
            padding: 12,
            borderRadius: 14,
            background: u.banned ? 'rgba(244,177,154,0.10)' : 'rgba(239,243,255,0.04)',
            border: `1px solid ${u.banned ? 'rgba(244,177,154,0.30)' : 'var(--c-line)'}`,
            color: 'var(--c-on-dark)',
            cursor: 'pointer',
            display: 'flex', flexDirection: 'column', gap: 4,
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
            <span style={{ fontSize: 13.5, fontWeight: 600 }}>
              {[u.firstName, u.lastName].filter(Boolean).join(' ') || u.username || `id ${u.id}`}
              {u.isAdmin && <span style={{ color: 'var(--c-accent)', marginLeft: 6, fontSize: 10, fontWeight: 700 }}>ADMIN</span>}
              {u.smileTester && !u.isAdmin && !u.envAdmin && <span style={{ color: 'var(--c-accent)', marginLeft: 6, fontSize: 10, fontWeight: 700 }}>ТЕСТ УЛЫБКИ</span>}
              {u.banned && <span style={{ color: '#F4B19A', marginLeft: 6, fontSize: 10 }}>BAN</span>}
            </span>
            <span className="mono" style={{ fontSize: 9.5, color: 'var(--c-accent)' }}>
              {u.credits} ГЕН
            </span>
          </div>
          <div style={{ fontSize: 11, color: 'var(--c-on-dark-2)', display: 'flex', justifyContent: 'space-between' }}>
            <span>{u.username ? `@${u.username}` : `id ${u.id}`} · {u.jobsTotal} jobs · баланс {u.credits}</span>
            <span style={{ color: 'var(--c-on-dark-3)' }}>{u.lastSeenAt ? new Date(u.lastSeenAt).toLocaleDateString('ru-RU') : '—'}</span>
          </div>
        </button>
      ))}
      {/* Подгрузка при прокрутке: долистал до низа — подтянулись следующие.
          Кнопку не ставим, она была бы лишним шагом там, где человек и так
          уже крутит вниз. Маячок оставлен видимым: пока грузится, видно что.
          При активном поиске не подгружаем — там выборка узкая и полная. */}
      {hasMore && !search.trim() ? (
        <div
          ref={sentinel}
          style={{
            padding: '14px 0', textAlign: 'center',
            fontSize: 12.5, color: 'var(--c-on-dark-3)',
          }}
        >
          {more ? 'Загружаем…' : `Показано ${items.length} из ${total}`}
        </div>
      ) : null}


      {selected && (
        <UserActions
          user={selected}
          onClose={() => setSelected(null)}
          onChanged={() => { setSelected(null); reload(); }}
        />
      )}
    </div>
  );
}

function UserActions({ user, onClose, onChanged }: { user: AdminUser; onClose: () => void; onChanged: () => void }) {
  const [credits, setCredits] = useState('10');
  const [reason, setReason] = useState('');
  const [grants, setGrants] = useState<AdminGrant[] | null>(null);
  const [message, setMessage] = useState('');

  // Журнал ручных начислений — чтобы при виде баланса без покупок было
  // понятно, откуда он: приз, компенсация или что-то не то.
  useEffect(() => {
    let cancelled = false;
    api.adminGrants(user.id)
      .then(({ grants: g }) => { if (!cancelled) setGrants(g); })
      .catch(() => { if (!cancelled) setGrants([]); });
    return () => { cancelled = true; };
  }, [user.id]);
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const wrap = async (label: string, fn: () => Promise<unknown>) => {
    setBusy(label); setErr(null);
    try { await fn(); onChanged(); }
    catch (e) { setErr(e instanceof Error ? e.message : 'error'); }
    finally { setBusy(null); }
  };

  return (
    <div
      role="button"
      tabIndex={-1}
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 100,
        display: 'flex', alignItems: 'flex-end',
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: '100%',
          background: 'var(--c-bg)',
          borderRadius: '20px 20px 0 0',
          padding: 18,
          maxHeight: '80vh',
          overflowY: 'auto',
          color: 'var(--c-on-dark)',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 14 }}>
          <div>
            <div style={{ fontSize: 16, fontWeight: 600 }}>
              {[user.firstName, user.lastName].filter(Boolean).join(' ') || `id ${user.id}`}
            </div>
            <div style={{ fontSize: 11, color: 'var(--c-on-dark-3)', marginTop: 2 }}>
              {user.username ? `@${user.username} · ` : ''}id {user.id}
            </div>
          </div>
          <button
            type="button" onClick={onClose}
            style={{ background: 'transparent', border: 'none', color: 'var(--c-on-dark-2)', fontSize: 22, cursor: 'pointer' }}
          >×</button>
        </div>

        {err && (
          <div style={{ padding: 10, borderRadius: 10, background: 'rgba(244,177,154,0.12)', color: '#F4B19A', fontSize: 12, marginBottom: 12 }}>
            {err}
          </div>
        )}

        <ProfileButton userId={user.id} username={user.username} />

        <Spacer />

        <SectionTitle>Начислить генерации</SectionTitle>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 6 }}>
          <input
            value={credits}
            onChange={(e) => setCredits(e.target.value.replace(/[^\d]/g, ''))}
            style={{
              width: 60, padding: '6px 8px', borderRadius: 8,
              background: 'rgba(239,243,255,0.04)', border: '1px solid var(--c-line)',
              color: 'var(--c-on-dark)', fontSize: 13, fontFamily: 'inherit',
            }}
          />
          <span style={{ fontSize: 11.5, color: 'var(--c-on-dark-3)' }}>прибавится к балансу</span>
        </div>
        <input
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="За что: приз конкурса, компенсация…"
          maxLength={200}
          style={{
            width: '100%', padding: '8px 10px', borderRadius: 8, marginBottom: 6,
            background: 'rgba(239,243,255,0.04)', border: '1px solid var(--c-line)',
            color: 'var(--c-on-dark)', fontSize: 13, fontFamily: 'inherit', boxSizing: 'border-box',
          }}
        />
        <ActionBtn
          label={busy === 'credits' ? '⏳ выдаём…' : `+${credits || 0} на баланс`}
          onClick={() => wrap('credits', () => api.adminGrantCredits(user.id, Number(credits) || 0, reason))}
          disabled={busy !== null || !credits || Number(credits) < 1}
        />
        {grants && grants.length > 0 && (
          <div style={{ marginTop: 8, fontSize: 11.5, color: 'var(--c-on-dark-3)', lineHeight: 1.5 }}>
            {grants.map((g, i) => (
              <div key={i}>
                +{g.delta} · {new Date(g.createdAt).toLocaleDateString('ru-RU')}
                {g.reason ? ` · ${g.reason}` : ''}
              </div>
            ))}
          </div>
        )}

        <Spacer />

        <SectionTitle>Сообщение в Telegram</SectionTitle>
        <textarea
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder="Текст сообщения юзеру..."
          rows={3}
          style={{
            width: '100%', padding: 10, borderRadius: 10, marginBottom: 6,
            background: 'rgba(239,243,255,0.04)', border: '1px solid var(--c-line)',
            color: 'var(--c-on-dark)', fontSize: 13, fontFamily: 'inherit', resize: 'vertical',
            boxSizing: 'border-box',
          }}
        />
        <ActionBtn
          label={busy === 'msg' ? '⏳ отправляем…' : 'Отправить сообщение'}
          onClick={() => wrap('msg', () => api.adminSendMessage(user.id, message))}
          disabled={busy !== null || !message.trim()}
        />

        <Spacer />

        <SectionTitle>Примерить улыбку · закрытый тест</SectionTitle>
        <div style={{ fontSize: 11.5, color: 'var(--c-on-dark-3)', lineHeight: 1.5, marginBottom: 8 }}>
          {user.isAdmin || user.envAdmin
            ? 'Администратору примерка доступна автоматически.'
            : 'Доступ к примерке без прав администратора. После изменения нужно заново открыть приложение.'}
          {user.banned ? ' Заблокированному аккаунту примерка недоступна.' : ''}
        </div>
        {!user.isAdmin && !user.envAdmin && (
          <ActionBtn
            label={busy === 'smile-tester' ? 'Сохраняем…' : user.smileTester ? 'Закрыть доступ к примерке' : 'Добавить в тест примерки'}
            danger={user.smileTester}
            onClick={() => wrap('smile-tester', () => api.adminSetSmileTester(user.id, !user.smileTester))}
            disabled={busy !== null || (user.banned && !user.smileTester)}
          />
        )}

        <Spacer />

        <SectionTitle>Админ</SectionTitle>
        {user.envAdmin ? (
          <div style={{ fontSize: 11.5, color: 'var(--c-on-dark-3)', padding: '2px 0 4px' }}>
            Супер-админ из ADMIN_IDS — снять права можно только в env-переменной.
          </div>
        ) : (
          <ActionBtn
            label={busy === 'admin' ? '⏳…' : user.isAdmin ? 'Снять права админа' : 'Назначить админом'}
            danger={user.isAdmin}
            onClick={() => wrap('admin', () => api.adminSetAdmin(user.id, !user.isAdmin))}
            disabled={busy !== null}
          />
        )}

        <Spacer />

        <SectionTitle>Бан</SectionTitle>
        <ActionBtn
          label={busy === 'ban' ? '⏳…' : user.banned ? 'Разбанить' : 'Забанить'}
          danger={!user.banned}
          onClick={() => wrap('ban', () => api.adminBan(user.id, !user.banned))}
          disabled={busy !== null}
        />
      </div>
    </div>
  );
}

// ─── маленькие компоненты ─────────────────────────────────────────────────
const GOAL_TEXT = { open: 'открыли', job: 'загрузили', payment: 'купили' } as const;

/** Сообщения автоворонки: сколько ушло и сколько человек после них сделали шаг. */
function FunnelMessages({ funnel }: { funnel: NonNullable<AdminStats['funnel']> }) {
  const total = funnel.steps.reduce((s, x) => s + x.sent, 0);
  return (
    <>
      <SectionTitle>Сообщения бота</SectionTitle>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
        <Kpi label="ОТПРАВЛЕНО" value={total} />
        <Kpi label="ОТПИСАЛИСЬ" value={funnel.optedOut} />
        <Kpi label="ЗАБЛОКИРОВАЛИ" value={funnel.blocked} />
      </div>
      <Card kind="dark" pad={12} radius={16}>
        {funnel.steps.map((s, i) => (
          <div
            key={s.step}
            style={{
              display: 'flex', justifyContent: 'space-between', gap: 8, padding: '6px 0',
              borderBottom: i < funnel.steps.length - 1 ? '1px solid var(--c-line)' : 'none',
              fontSize: 12, opacity: s.sent === 0 ? 0.5 : 1,
            }}
          >
            <span style={{ color: 'var(--c-on-dark-2)' }}>{s.label}</span>
            <span style={{ whiteSpace: 'nowrap', textAlign: 'right' }}>
              <b>{s.sent}</b>
              {s.goal && s.converted !== null && s.sent > 0 && (
                <span style={{ color: 'var(--c-accent)' }}>
                  {' · '}{GOAL_TEXT[s.goal]} {Math.round((s.converted / s.sent) * 100)}%
                </span>
              )}
              {s.failed > 0 && <span style={{ color: '#F4B19A' }}> · не дошло {s.failed}</span>}
            </span>
          </div>
        ))}
      </Card>
      <div style={{ fontSize: 11.5, color: 'var(--c-on-dark-3)', lineHeight: 1.45 }}>
        Бот сам пишет новичкам, которые застряли на каком-то шаге. «Открыли»,
        «загрузили» и «купили» — доля тех, кто сделал это в течение 3 дней после
        сообщения (покупку ждём 7). Если после какого-то шага растёт число
        заблокировавших — этот текст раздражает.
      </div>
    </>
  );
}

function Kpi({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <Card kind="dark" pad={12} radius={16}>
      <div className="mono" style={{ fontSize: 9.5, letterSpacing: 0.6, color: 'var(--c-on-dark-3)' }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 600, letterSpacing: -0.6, marginTop: 4 }}>{value}</div>
      {sub && <div style={{ fontSize: 10.5, color: 'var(--c-on-dark-3)', marginTop: 2 }}>{sub}</div>}
    </Card>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="mono"
      style={{ fontSize: 9.5, letterSpacing: 0.6, color: 'var(--c-on-dark-3)', margin: '4px 0' }}
    >
      {String(children).toUpperCase()}
    </div>
  );
}

function Hint({ text, error }: { text: string; error?: boolean }) {
  return (
    <div style={{ padding: '20px 16px', textAlign: 'center', fontSize: 12.5, color: error ? '#F4B19A' : 'var(--c-on-dark-3)' }}>
      {text}
    </div>
  );
}

function Spacer() {
  return <div style={{ height: 1, background: 'var(--c-line)', margin: '14px 0' }} />;
}

/**
 * «Посетить профиль» человека в Telegram.
 *
 * С username открываем t.me/username прямо отсюда. Без него мини-апп профиль
 * открыть не может — ссылку по id Telegram принимает только из кнопки под
 * сообщением бота, — поэтому просим бота прислать такую кнопку в чат.
 */
function ProfileButton({ userId, username, compact }: { userId: number; username: string | null; compact?: boolean }) {
  const [note, setNote] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const open = async () => {
    if (username) {
      WebApp?.openTelegramLink?.(`https://t.me/${username}`);
      return;
    }
    setBusy(true); setNote(null);
    try {
      const { restricted } = await api.adminProfileLink(userId);
      setNote(restricted
        ? 'Профиль закрыт настройками приватности — подробности в чате с ботом'
        : 'Кнопка профиля пришла в чат с ботом');
    } catch (e) {
      setNote(e instanceof Error ? e.message : 'Не получилось');
    } finally {
      setBusy(false);
    }
  };

  const label = busy ? '⏳ отправляем…' : 'Посетить профиль';

  if (!compact) {
    return (
      <>
        <ActionBtn label={label} onClick={open} disabled={busy} />
        {note && <div style={{ fontSize: 11.5, color: 'var(--c-on-dark-3)', marginTop: 6 }}>{note}</div>}
      </>
    );
  }

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 6, flexWrap: 'wrap' }}>
      <button
        type="button" onClick={open} disabled={busy}
        style={{
          padding: '4px 10px', borderRadius: 8,
          background: 'transparent', border: '1px solid var(--c-line)',
          color: 'var(--c-accent)', fontSize: 11, fontWeight: 600, fontFamily: 'inherit',
          cursor: busy ? 'default' : 'pointer', opacity: busy ? 0.6 : 1,
        }}
      >{label}</button>
      {note && <span style={{ fontSize: 10.5, color: 'var(--c-on-dark-3)' }}>{note}</span>}
    </div>
  );
}

function ActionBtn({ label, onClick, disabled, danger }: { label: string; onClick: () => void; disabled?: boolean; danger?: boolean }) {
  return (
    <button
      type="button" onClick={onClick} disabled={disabled}
      style={{
        width: '100%', padding: '10px 14px', borderRadius: 12, border: 'none',
        background: danger ? '#F4B19A' : 'var(--c-accent)',
        color: 'var(--c-ink)',
        fontSize: 12.5, fontWeight: 700, letterSpacing: -0.1,
        cursor: disabled ? 'default' : 'pointer',
        opacity: disabled ? 0.5 : 1,
      }}
    >
      {label}
    </button>
  );
}

function BarChart({ data }: { data: AdminStats['byDay'] }) {
  if (data.length === 0) {
    return (
      <Card kind="dark" pad={12} radius={16}>
        <div style={{ fontSize: 12, color: 'var(--c-on-dark-3)' }}>За 14 дней пока тихо</div>
      </Card>
    );
  }
  const max = Math.max(1, ...data.map((d) => d.total));
  return (
    <Card kind="dark" pad={12} radius={16}>
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 4, height: 80 }}>
        {data.map((d) => {
          const h    = Math.max(2, Math.round((d.total / max) * 70));
          const doneH = d.total > 0 ? Math.round(h * (d.done / d.total)) : 0;
          return (
            <div key={d.day} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'flex-end', gap: 2 }}>
              <div style={{ width: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', height: h, borderRadius: 3, overflow: 'hidden' }}>
                <div style={{ background: 'rgba(239,243,255,0.18)', height: h - doneH }} />
                <div style={{ background: 'var(--c-accent)', height: doneH }} />
              </div>
              <div className="mono" style={{ fontSize: 7, color: 'var(--c-on-dark-3)', whiteSpace: 'nowrap' }}>
                {d.day.slice(5)}
              </div>
            </div>
          );
        })}
      </div>
      <div style={{ fontSize: 10, color: 'var(--c-on-dark-3)', marginTop: 8 }}>
        <span style={{ color: 'var(--c-accent)' }}>■</span> done · <span>■</span> all
      </div>
    </Card>
  );
}

/** Рубли без копеек и с разделителями: 1 500 ₽. */
/** Предупреждение, если денег у провайдера осталось меньше недельного расхода. */
/**
 * Подпись под остатком: когда его сняли и сколько зарезервировано.
 *
 * Время замера здесь потому, что цифра однажды разошлась с личным кабинетом
 * провайдера, и понять, устарела она или нет, было нечем. Остаток снимается
 * при каждом открытии админки и после каждой работы.
 */
function balanceSub(stats: AdminStats): string {
  if (stats.providerError) return 'замер не удался — цифра старая, причина ниже';
  const parts = [lowBalanceHint(stats)];
  if (stats.providerReserved !== null && stats.providerReserved > 0) {
    parts.push(`${money(Math.round(stats.providerReserved))} в резерве`);
  }
  if (stats.providerMeasuredAt) {
    const at = new Date(stats.providerMeasuredAt);
    const mins = Math.round((Date.now() - at.getTime()) / 60000);
    parts.push(mins < 2
      ? 'замер только что'
      : mins < 60
        ? `замер ${mins} мин назад`
        : `замер ${at.toLocaleString('ru-RU', { dateStyle: 'short', timeStyle: 'short' })}`);
  }
  return parts.join(' · ');
}

function lowBalanceHint(stats: AdminStats): string {
  const weekly = stats.providerSpent7d;
  const left = stats.providerBalance ?? 0;
  // Недельного расхода ещё не знаем — обещать «на сколько хватит» нечестно.
  if (weekly === null || weekly <= 0) return 'темп расхода пока неизвестен';
  const weeks = left / weekly;
  if (weeks < 1) return 'меньше недели — пополните';
  if (weeks < 3) return `хватит примерно на ${Math.floor(weeks)} нед.`;
  return 'запас есть';
}

/** Значение за период: пока нет двух замеров, показывать нечего. */
function period(v: number | null): string {
  return v === null ? '—' : money(Math.round(v));
}

/** Доля в процентах — чтобы числа читались без калькулятора. */
function pct(part: number, whole: number, suffix: string): string {
  if (!whole) return '—';
  return `${Math.round((part / whole) * 100)}% ${suffix}`;
}

function money(n: number): string {
  return `${Math.round(n).toLocaleString('ru-RU')} ₽`;
}

function shortNum(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M';
  if (n >= 1000)      return (n / 1000).toFixed(1) + 'k';
  return String(n);
}
