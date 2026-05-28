import { useEffect, useState } from 'react';
import { Screen } from '../components/Screen';
import { ScreenIntro } from '../components/ScreenIntro';
import { Card } from '../components/primitives/Card';
import { Pill } from '../components/primitives/Pill';
import { useBackButton } from '../telegram/useBackButton';
import { useMainButton } from '../telegram/useMainButton';
import { useRouter } from '../router/Router';
import { api, type AdminStats, type AdminUser } from '../api/client';
import type { Plan } from '../state/types';

type Tab = 'dashboard' | 'users';

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
        style={{ padding: '0 22px 14px', display: 'flex', gap: 6 }}
      >
        <Pill size="sm" kind={tab === 'dashboard' ? 'accent' : 'ghost'} onClick={() => setTab('dashboard')}>
          Дашборд
        </Pill>
        <Pill size="sm" kind={tab === 'users' ? 'accent' : 'ghost'} onClick={() => setTab('users')}>
          Юзеры
        </Pill>
      </div>

      {tab === 'dashboard' ? <DashboardTab /> : <UsersTab />}
    </Screen>
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

      <SectionTitle>Последние ошибки</SectionTitle>
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

  const reload = async (q: string = search) => {
    setLoading(true);
    try {
      const r = await api.adminUsers(q.trim() || undefined);
      setItems(r.items);
    } catch { /* ignore */ }
    finally { setLoading(false); }
  };

  useEffect(() => { reload(''); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);

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
              {u.banned && <span style={{ color: '#F4B19A', marginLeft: 6, fontSize: 10 }}>BAN</span>}
            </span>
            <span className="mono" style={{ fontSize: 9.5, color: 'var(--c-accent)' }}>
              {u.plan.toUpperCase()}
            </span>
          </div>
          <div style={{ fontSize: 11, color: 'var(--c-on-dark-2)', display: 'flex', justifyContent: 'space-between' }}>
            <span>{u.username ? `@${u.username}` : `id ${u.id}`} · {u.jobsTotal} jobs · {u.usageUsed}/{u.usageLimit}</span>
            <span style={{ color: 'var(--c-on-dark-3)' }}>{u.lastSeenAt ? new Date(u.lastSeenAt).toLocaleDateString('ru-RU') : '—'}</span>
          </div>
        </button>
      ))}

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
  const [plan, setPlan] = useState<Plan>(user.plan);
  const [credits, setCredits] = useState('10');
  const [message, setMessage] = useState('');
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

        <SectionTitle>План</SectionTitle>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 8 }}>
          {(['free', 'start', 'pro', 'lab'] as Plan[]).map((p) => (
            <Pill key={p} size="sm" kind={plan === p ? 'accent' : 'ghost'} onClick={() => setPlan(p)}>
              {p.toUpperCase()}
            </Pill>
          ))}
        </div>
        <ActionBtn
          label={busy === 'plan' ? '⏳ сохраняем…' : 'Сменить план'}
          onClick={() => wrap('plan', () => api.adminSetPlan(user.id, plan))}
          disabled={busy !== null || plan === user.plan}
        />

        <Spacer />

        <SectionTitle>Бонусные генерации</SectionTitle>
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
          <span style={{ fontSize: 11.5, color: 'var(--c-on-dark-3)' }}>прибавится к лимиту</span>
        </div>
        <ActionBtn
          label={busy === 'credits' ? '⏳ выдаём…' : `+${credits || 0} к лимиту`}
          onClick={() => wrap('credits', () => api.adminGrantCredits(user.id, Number(credits) || 0))}
          disabled={busy !== null || !credits || Number(credits) < 1}
        />

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

function shortNum(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M';
  if (n >= 1000)      return (n / 1000).toFixed(1) + 'k';
  return String(n);
}
