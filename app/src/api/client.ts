/**
 * Тонкий fetch-клиент. Если VITE_API_BASE_URL не задан — работаем в mock-режиме,
 * чтобы UI можно было листать без бэка. Когда задан — реальные вызовы Edge Functions.
 */
import type { BrandData, Job, StyleId, TextType, WorkType, FormatId, BrandingKind } from '../state/types';
import { WebApp } from '../telegram/webapp';
import { newRequestKey } from '../lib/job-request';

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? '';
const SUPABASE_ANON = import.meta.env.VITE_SUPABASE_ANON_KEY ?? '';

function initData(): string {
  return WebApp?.initData ?? '';
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Сколько ждём готовности job, прежде чем показать ошибку.
 * Больше, чем watchdog в process-job (5 мин на processing), чтобы юзер сначала
 * увидел настоящую причину сбоя от бэка, а не общий таймаут.
 */
const JOB_POLL_TIMEOUT_MS = 14 * 60 * 1000;

/**
 * fetch с ретраями для сетевых сбоев. iOS WebKit при флапе сети / cold-start Edge-функции
 * бросает TypeError «Load failed» — это transient, на повторе обычно проходит.
 * Ретраим ТОЛЬКО сетевые ошибки (fetch reject), НЕ HTTP-ответы (4xx/5xx возвращаем как есть —
 * 401/429/402 повторять смысла нет).
 */
// Сколько ждём ответа сервера на одну попытку.
//
// Предела не было, и через плохую сеть — например VPN, который теряет пакеты,
// не разрывая соединения, — запрос не падал, а висел минутами. Повтор ниже при
// этом не срабатывал: он ждёт ошибки, а её не случалось.
const REQUEST_TIMEOUT_MS = 12_000;

async function fetchWithRetry(url: string, init: RequestInit, retries = 2): Promise<Response> {
  let lastErr: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    // Контроллер с таймером, а не AbortSignal.timeout: последнего нет в части
    // встроенных браузеров Telegram на старых iOS, а этот способ работает везде.
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), REQUEST_TIMEOUT_MS);
    const abort=()=>ctrl.abort();
    init.signal?.addEventListener('abort',abort,{once:true});
    if(init.signal?.aborted)ctrl.abort();
    try {
      return await fetch(url, { ...init, signal: ctrl.signal });
    } catch (e) {
      if(init.signal?.aborted)throw e;
      lastErr = e;
      if (attempt < retries) await sleep(600 * (attempt + 1)); // 0.6s, 1.2s
    } finally {
      clearTimeout(timer);
      init.signal?.removeEventListener('abort',abort);
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error('network');
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  if (!API_BASE) throw new Error('VITE_API_BASE_URL is not set');
  const res = await fetchWithRetry(`${API_BASE}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      'x-telegram-initdata': initData(),
      ...(SUPABASE_ANON ? { apikey: SUPABASE_ANON, Authorization: `Bearer ${SUPABASE_ANON}` } : {}),
      ...init?.headers,
    },
  });
  if (!res.ok) {
    let detail = '';
    try {
      const j = await res.json();
      detail = j.code ? `${j.error}/${j.code}` : (j.error ?? '');
      if (j.debug) detail += ` ${JSON.stringify(j.debug)}`;
    } catch {
      detail = await res.text().catch(() => '');
    }
    throw new Error(`${res.status} ${path}: ${detail}`);
  }
  return res.json() as Promise<T>;
}

export interface CreateJobInput {
  requestKey?: string;
  photoPath: string;
  workType?: WorkType;
  style: StyleId;
  format: FormatId;
  branding: BrandingKind;
  textType: TextType;
  decorPreset?: string;
  decorAddition?: string;
}

export interface JobResult {
  id: string;
  status: 'created' | 'photo_uploaded' | 'settings_selected' | 'processing' | 'done' | 'failed';
  resultUrl?: string | null;
  caption?: { main: string; alt?: string; hashtags: string[]; source?: 'ai'|'template'|'none' };
  stage?: 'queued'|'image'|'caption';
  error?: string | null;
}

export interface MeResponse {
  user: {
    telegramId: number;
    username?: string;
    firstName?: string;
    lastName?: string;
    photoUrl?: string;
    credits: number;
    isAdmin?: boolean;
    canSmilePreview?: boolean;
    smileProvider?: 'polza'|'fal';
    smileInviteStatus?: import('../state/types').SmileInviteStatus;
    refCode?: string | null;
    referralsCount?: number;
    referralsPaid?: number;
    /** Когда принята политика обработки данных. null — не принимал. */
    consentAt?: string | null;
    consentVersion?: number | null;
  } | null;
  brand: Partial<BrandData> | null;
}

export interface SaveBrandInput {
  masterName?: string;
  labName?: string;
  defaultStyle?: StyleId;
  logoPlacement?: BrandData['logoPlacement'];
  hashtags?: string[];
  removeLogo?: boolean;
  logoPath?: string;     // относительный путь в bucket 'brand' (получен через api.uploadLogo)
  fontId?: string;       // ID шрифта подписи из app/src/lib/fonts.ts
}

export interface AdminGrant {
  delta: number;
  reason: string | null;
  adminId: number;
  createdAt: string;
}

export interface ListJobsResponse {
  items: Array<{
    id: string;
    style: StyleId;
    format: FormatId;
    workType?: WorkType;
    resultUrl?: string;
    /** Уменьшенная копия для квадратика истории. Нет — показываем resultUrl. */
    thumbUrl?: string;
    captionMain?: string;
    createdAt: number;
  }>;
}

export interface AdminUser {
  id: number;
  username: string | null;
  firstName: string | null;
  lastName: string | null;
  credits: number;
  banned: boolean;
  isAdmin: boolean;
  smileTester: boolean;
  /** true если id в env ADMIN_IDS — такого админа нельзя снять из приложения. */
  envAdmin: boolean;
  lastSeenAt: string | null;
  createdAt: string | null;
  jobsTotal: number;
}

export interface AdminSmileInvite {
  id: string;
  label: string | null;
  createdAt: string;
  expiresAt: string;
  revokedAt: string | null;
  usedAt: string | null;
  usedBy: number | null;
  status: 'active' | 'used' | 'revoked' | 'expired';
}

export interface CreatedSmileInvite {
  id: string;
  url: string;
  expiresAt: string;
  label: string | null;
}

export interface AdminStats {
  resilience?: {
    available:boolean;attempts24h?:number;limit24h?:number;unknownAttempts?:number;queuedJobs?:number;
    providers?:Array<{name:string;id:string;configured:boolean;enabled:boolean;openUntil:string|null;lastSuccessAt:string|null;lastError:string|null}>;
    backup?:{snapshot_at:string;completed_at:string;data_verified:boolean;storage_verified:boolean;storage_included:boolean;portable_recovery:boolean}|null;
  };
  totalUsers: number;
  newUsers7d: number;
  jobs7d: number;
  successRate7d: number;
  likeRate30d: number | null;
  tokens7d: number;
  recentErrors: Array<{ provider: string; error: string | null; created_at: string }>;
  /**
   * Сколько раз за неделю агент не смог собрать промт и пайплайн откатился на
   * стандартный. Это не сбой — работа доходит до конца, — но если число близко
   * к количеству работ, значит персонализация фактически не работает.
   */
  agentFallback7d: number;
  /** Работы, упавшие за неделю: с причиной и владельцем, чтобы написать человеку. */
  recentFailures: Array<{
    id: string;
    user_id: number;
    username: string | null;
    first_name: string | null;
    error_message: string | null;
    created_at: string;
  }>;
  topUsers: Array<{ userId: number; jobs: number }>;
  byDay: Array<{ day: string; total: number; done: number }>;

  revenueTotal: number;
  revenue7d: number;
  revenue30d: number;
  paymentsTotal: number;
  payments30d: number;
  avgCheck: number;
  creditsSold: number;
  /** Остаток у провайдера моделей. null — замеров ещё нет. */
  providerBalance: number | null;
  providerCurrency: string;
  /** Вся сумма на счёте провайдера, включая зарезервированное. */
  providerTotal: number | null;
  providerReserved: number | null;
  /** Когда остаток снимали в последний раз. */
  providerMeasuredAt: string | null;
  /** null, пока нет двух замеров. */
  providerSpent7d: number | null;
  providerSpent30d: number | null;
  providerToppedUp30d: number | null;
  /** Потрачено за всё время — отдаёт сам провайдер. */
  providerSpentTotal: number | null;
  /** Выручка минус расход на модели. null, пока расход неизвестен. */
  margin30d: number | null;
  /** То же за всё время. Доступна сразу. */
  marginTotal: number | null;
  /** Комиссия Продамуса за всё время — из уведомлений. */
  commissionTotal: number;
  /** Налог НПД 4% с выручки. */
  taxTotal: number;
  /** Чистыми: выручка минус модели, комиссия и налог. */
  netTotal: number | null;
  /** Дошли до первой генерации. */
  activated: number;
  /** Зарегистрировались и ни разу не сгенерировали. */
  neverGenerated: number;
  /** Упёрлись в нулевой баланс. */
  zeroCredits: number;
  /** Заплатили хоть раз. */
  payers: number;
  /** Применили промокод или пришли по приглашению. */
  referredCount: number;
  /** Из приглашённых — дошли до оплаты. */
  referralPaidCount: number;
  /** Сколько работ доведено до результата. */
  doneTotal: number;
  /** Из них — работы тех, кто ни разу не платил. */
  freeDone: number;
  /** Средняя себестоимость одной генерации. */
  costPerGeneration: number | null;
  /** Во сколько обошлись работы неплатящих. */
  freeSpend: number | null;
  /** Сколько замеров легло в расчёт расхода. */
  financePoints: number;
  /** Почему не удалось снять остаток. null — всё в порядке. */
  providerError: string | null;
  /** Автоворонка бота. null — миграция 0023 ещё не накатана. */
  funnel: {
    steps: Array<{
      step: string;
      label: string;
      /** Что считается «сработало»: открыл приложение, сделал работу, заплатил. */
      goal: 'open' | 'job' | 'payment' | null;
      sent: number;
      failed: number;
      /** null — у шага нет измеримой цели. */
      converted: number | null;
    }>;
    blocked: number;
    optedOut: number;
  } | null;
}

export interface AdminPayment {
  orderId: string;
  userId: number;
  username: string | null;
  firstName: string | null;
  packageId: string;
  credits: number;
  amountRub: number;
  createdAt: string;
}

export const api = {
  /**
   * Загрузка фото: фронт получает подписанный upload-URL у бэка, потом PUT файл прямо в Storage.
   * Mock — отдаём blob-URL.
   */
  async uploadPhoto(file: File): Promise<{ photoPath: string; previewUrl: string }> {
    if (!API_BASE) {
      return {
        photoPath: `mock/${Date.now()}-${file.name}`,
        previewUrl: URL.createObjectURL(file),
      };
    }
    const { uploadUrl, photoPath } = await request<{ uploadUrl: string; photoPath: string }>(
      '/sign-upload',
      { method: 'POST', body: JSON.stringify({ filename: file.name, contentType: file.type, kind: 'photo' }) },
    );
    const put = await fetchWithRetry(uploadUrl, { method: 'PUT', headers: { 'Content-Type': file.type }, body: file });
    if (!put.ok) throw new Error(`upload ${put.status}`);
    return { photoPath, previewUrl: URL.createObjectURL(file) };
  },

  /**
   * Загрузка логотипа: фронт получает подписанный URL у `/sign-upload?kind=logo`,
   * PUT файла в bucket 'brand', возвращает relative path для сохранения в БД через /save-brand.
   */
  async uploadLogo(file: File): Promise<{ logoPath: string; previewUrl: string }> {
    if (!API_BASE) {
      return {
        logoPath: `mock-logo/${Date.now()}-${file.name}`,
        previewUrl: URL.createObjectURL(file),
      };
    }
    const { uploadUrl, photoPath } = await request<{ uploadUrl: string; photoPath: string }>(
      '/sign-upload',
      { method: 'POST', body: JSON.stringify({ filename: file.name, contentType: file.type, kind: 'logo' }) },
    );
    const put = await fetchWithRetry(uploadUrl, { method: 'PUT', headers: { 'Content-Type': file.type }, body: file });
    if (!put.ok) throw new Error(`upload ${put.status}`);
    return { logoPath: photoPath, previewUrl: URL.createObjectURL(file) };
  },

  async createJob(input: CreateJobInput, signal?: AbortSignal): Promise<JobResult> {
    if (!API_BASE) {
      await new Promise((r) => setTimeout(r, 600));
      return { id: 'mock-' + Date.now(), status: 'processing' };
    }
    return request<JobResult>('/create-job', { method: 'POST', signal, body: JSON.stringify({ ...input, requestKey: input.requestKey ?? newRequestKey() }) });
  },

  async getJob(id: string, signal?: AbortSignal): Promise<JobResult> {
    if (!API_BASE) {
      return { id, status: 'done', resultUrl: null, caption: { main: '', hashtags: [] } };
    }
    return request<JobResult>(`/get-job?id=${encodeURIComponent(id)}`, { signal });
  },

  async me(): Promise<MeResponse | null> {
    if (!API_BASE) return null;
    return request<MeResponse>('/me');
  },

  async saveBrand(input: SaveBrandInput): Promise<{ ok: true }> {
    if (!API_BASE) return { ok: true };
    return request<{ ok: true }>('/save-brand', {
      method: 'POST',
      body: JSON.stringify(input),
    });
  },

  async listJobs(limit = 24): Promise<ListJobsResponse> {
    if (!API_BASE) return { items: [] };
    return request<ListJobsResponse>(`/list-jobs?limit=${limit}`);
  },

  /** Пере-генерация хэштегов под бренд для уже завершённого job. */
  async regenHashtags(jobId: string): Promise<{ hashtags: string[] }> {
    if (!API_BASE) return { hashtags: ['#стоматология', '#зуботехник', '#керамика'] };
    return request<{ hashtags: string[] }>('/regen-hashtags', {
      method: 'POST',
      body: JSON.stringify({ jobId }),
    });
  },

  /** Оценка результата job: 👍 / 👎. Сохраняется в БД, агент учитывает в следующих генерациях. */
  async jobFeedback(jobId: string, feedback: 'liked' | 'disliked'): Promise<{ ok: true }> {
    if (!API_BASE) return { ok: true };
    return request<{ ok: true }>('/job-feedback', {
      method: 'POST',
      body: JSON.stringify({ jobId, feedback }),
    });
  },

  /** Сгенерить «вечнозелёный» набор хэштегов под бренд (имя, лаба, типы работ). Сохраняет в brand.hashtags. */
  async regenBrandHashtags(): Promise<{ hashtags: string[] }> {
    if (!API_BASE) return { hashtags: ['#зубнойтехник', '#керамика', '#циркон'] };
    return request<{ hashtags: string[] }>('/regen-brand-hashtags', { method: 'POST', body: '{}' });
  },

  /** Админ-роутер — все действия идут через единый endpoint /admin (action-based). */
  async adminStats(): Promise<AdminStats> {
    return request<AdminStats>('/admin', {
      method: 'POST',
      body: JSON.stringify({ action: 'stats' }),
    });
  },
  async adminRefreshProviderBalance(): Promise<{ ok: true }> {
    return request<{ ok: true }>('/admin', {
      method: 'POST',
      body: JSON.stringify({ action: 'refresh-provider-balance' }),
    });
  },
  /** Зафиксировать согласие с политикой обработки персональных данных. */
  async giveConsent(version: number): Promise<{ consentAt: string }> {
    return request<{ consentAt: string }>('/consent', {
      method: 'POST',
      body: JSON.stringify({ version }),
    });
  },
  /** История покупок: кто, что и когда купил. */
  async adminPayments(limit = 50): Promise<{ payments: AdminPayment[] }> {
    return request<{ payments: AdminPayment[] }>('/admin', {
      method: 'POST',
      body: JSON.stringify({ action: 'payments', limit }),
    });
  },
  async adminUsers(search?: string, offset = 0): Promise<{ items: AdminUser[]; hasMore: boolean; total: number }> {
    return request<{ items: AdminUser[]; hasMore: boolean; total: number }>('/admin', {
      method: 'POST',
      body: JSON.stringify({ action: 'users', search, offset }),
    });
  },
  async adminGrantCredits(userId: number, credits: number, reason?: string): Promise<{ ok: true; credits: number }> {
    return request<{ ok: true; credits: number }>('/admin', {
      method: 'POST',
      body: JSON.stringify({ action: 'grant-credits', userId, credits, reason }),
    });
  },
  /** Журнал ручных начислений человеку. */
  async adminGrants(userId: number): Promise<{ grants: AdminGrant[] }> {
    return request<{ grants: AdminGrant[] }>('/admin', {
      method: 'POST',
      body: JSON.stringify({ action: 'grants', userId }),
    });
  },
  async adminSendMessage(userId: number, message: string): Promise<{ ok: true }> {
    return request<{ ok: true }>('/admin', {
      method: 'POST',
      body: JSON.stringify({ action: 'send-message', userId, message }),
    });
  },
  /** Бот пришлёт админу в чат кнопку, открывающую профиль человека по id. */
  async adminProfileLink(userId: number): Promise<{ ok: true; restricted: boolean }> {
    return request<{ ok: true; restricted: boolean }>('/admin', {
      method: 'POST',
      body: JSON.stringify({ action: 'profile-link', userId }),
    });
  },
  async adminBan(userId: number, banned: boolean): Promise<{ ok: true }> {
    return request<{ ok: true }>('/admin', {
      method: 'POST',
      body: JSON.stringify({ action: 'ban', userId, banned }),
    });
  },
  async adminSetAdmin(userId: number, isAdmin: boolean): Promise<{ ok: true }> {
    return request<{ ok: true }>('/admin', {
      method: 'POST',
      body: JSON.stringify({ action: 'set-admin', userId, isAdmin }),
    });
  },
  async adminSetSmileTester(userId: number, smileTester: boolean): Promise<{ ok: true }> {
    return request<{ ok: true }>('/admin', {
      method: 'POST',
      body: JSON.stringify({ action: 'set-smile-tester', userId, smileTester }),
    });
  },
  /** A create POST is never retried: a lost response must not create several invitation links. */
  async adminCreateSmileInvite(label?: string): Promise<CreatedSmileInvite> {
    if (!API_BASE) throw new Error('Сервер приглашений не подключён.');
    const response = await fetchWithRetry(`${API_BASE}/admin`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-telegram-initdata': initData(),
        ...(SUPABASE_ANON ? { apikey: SUPABASE_ANON, Authorization: `Bearer ${SUPABASE_ANON}` } : {}),
      },
      body: JSON.stringify({ action: 'create-smile-invite', ...(label?.trim() ? { label: label.trim() } : {}) }),
      cache: 'no-store',
    }, 0);
    if (!response.ok) {
      if (response.status === 429) throw new Error('Слишком много приглашений. Подождите немного.');
      if (response.status === 401 || response.status === 403) throw new Error('Не удалось подтвердить права администратора. Откройте приложение заново.');
      throw new Error('Не удалось создать приглашение. Обновите список перед новой попыткой.');
    }
    return response.json() as Promise<CreatedSmileInvite>;
  },
  async adminSmileInvites(): Promise<{ items: AdminSmileInvite[] }> {
    return request<{ items: AdminSmileInvite[] }>('/admin', {
      method: 'POST',
      body: JSON.stringify({ action: 'list-smile-invites' }),
      cache: 'no-store',
    });
  },
  async adminRevokeSmileInvite(inviteId: string): Promise<{ ok: true }> {
    return request<{ ok: true }>('/admin', {
      method: 'POST',
      body: JSON.stringify({ action: 'revoke-smile-invite', inviteId }),
      cache: 'no-store',
    });
  },
  async applyReferral(input: { code?: string; startParam?: string }): Promise<{ ok: boolean; already?: boolean; reason?: string }> {
    if (!API_BASE) return { ok: false, reason: 'mock' };
    return request<{ ok: boolean; already?: boolean; reason?: string }>('/apply-referral', {
      method: 'POST',
      body: JSON.stringify(input),
    });
  },

  async getHistory(): Promise<Job[]> {
    if (!API_BASE) return [];
    return request<Job[]>('/history');
  },

  /**
   * Polling — опрашивает get-job до done/failed.
   * Ограничен по времени: без этого зависший job означал вечный спиннер и
   * бесконечные запросы к бэку каждые 2 секунды, пока юзер не закроет приложение.
   * Нормальная обработка укладывается в 15–25 сек, так что порог задан с запасом.
   */
  async waitForJob(
    id: string,
    onTick?: (j: JobResult) => void,
    intervalMs = 2000,
    timeoutMs = JOB_POLL_TIMEOUT_MS,
    signal?: AbortSignal,
  ): Promise<JobResult> {
    const deadline = Date.now() + timeoutMs;
    for (;;) {
      if(signal?.aborted)throw new DOMException('Aborted','AbortError');
      if(Date.now()>=deadline)throw new Error(`job_timeout ${id}`);
      let j: JobResult;
      try {j=await this.getJob(id,signal);}
      catch(error) {
        if(signal?.aborted)throw error;
        const message=error instanceof Error ? error.message:'';
        if(/^(5\d\d|429)\b|network|load failed|fetch|aborted/i.test(message)) {
          await sleep(Math.max(3000,intervalMs));
          continue;
        }
        throw error;
      }
      onTick?.(j);
      if (j.status === 'done' || j.status === 'failed') return j;
      if (Date.now() >= deadline) throw new Error(`job_timeout ${id}`);
      await new Promise((r) => setTimeout(r, intervalMs));
    }
  },
};

export interface PaymentLink {
  url: string;
  orderId: string;
  credits: number;
  priceRub: number;
}

/**
 * Ссылка на оплату пакета. Всё существенное решает бэкенд: и цену, и то, кому
 * потом начислять — фронт передаёт только id пакета. Подменить сумму, правя
 * запрос, бесполезно: payment-webhook сверяет её с серверным прайсом.
 */
export function createPaymentLink(packageId: string, gift = false): Promise<PaymentLink> {
  return request<PaymentLink>('/payment-link', {
    method: 'POST',
    body: JSON.stringify({ packageId, gift }),
  });
}

/** Возвращает true, если бэкенд сконфигурирован (есть VITE_API_BASE_URL). */
export function isBackendReady(): boolean {
  return Boolean(API_BASE);
}

/**
 * Конвертирует сырое сообщение об ошибке (как формирует request()) в человеческий
 * заголовок + подсказку для UI. Известные коды получают понятный текст,
 * Неизвестные ошибки получают безопасную подсказку без внутренних кодов.
 */
export function friendlyError(raw: string): { title: string; sub: string } {
  if (raw.includes('processing_failed')) return { title: 'Не удалось обработать фото', sub: 'Во время обработки произошёл сбой. Попробуйте позже или напишите в поддержку.' };
  if(raw.includes('consent_required'))return {title:'Нужно согласие',sub:'Откройте приложение заново и примите условия обработки данных.'};
  if(raw.includes('daily_limit') || raw.includes('provider_daily_limit'))return {title:'Достигнут дневной лимит',sub:'Попробуйте позже. За неудачную обработку генерация возвращается.'};
  if(raw.includes('image_providers_unavailable') || raw.includes('provider_unavailable') || raw.includes('account_'))return {title:'Обработка временно недоступна',sub:'Сервис генерации недоступен. Попробуйте позже; за неудачную работу генерация не списывается.'};
  if(/processing_unavailable|job_create_unavailable|profile_unavailable|history_unavailable|result_unavailable/.test(raw))return {title:'Временный сбой связи',sub:'Попробуйте снова. Повтор запроса продолжит сохранённую работу.'};
  if (raw.includes('bad_signature') || raw.includes('empty_initdata') || raw.includes('no_hash') || raw.includes('no_user') || raw.includes('initdata_expired') || raw.includes('no_auth_date')) {
    return {
      title: 'Не удалось проверить личность',
      sub:   'Откройте мини-апп заново через бота — иногда Telegram даёт устаревший ключ.',
    };
  }
  if (raw.includes('job_timeout') || raw.includes('not_picked_up') || raw === 'timeout') {
    return {
      title: 'Обработка затянулась',
      sub:   'Сервер не успел вернуть результат. Работа могла всё же дойти — загляните в «Ваши работы» или попробуйте ещё раз.',
    };
  }
  if (raw.includes('rate_limited')) {
    return {
      title: 'Слишком часто',
      sub:   'Подождите пару минут и попробуйте снова.',
    };
  }
  if (raw.includes('too_many_in_progress') || raw.includes('429 ')) {
    return {
      title: 'Уже обрабатывается фото',
      sub:   'Дождитесь окончания предыдущей работы и попробуйте снова.',
    };
  }
  if (raw.includes('insufficient_credits')) {
    return {
      title: 'Генерации закончились',
      sub:   'Пополните баланс в разделе «Пакеты» — купленные генерации не сгорают.',
    };
  }
  if (raw.includes('create_failed') || raw.includes('reserve_failed') || raw.includes('forbidden_path')) {
    return {
      title: 'Не получилось запустить обработку',
      sub:   'Сбой на нашей стороне, генерация не списана. Загрузите фото ещё раз.',
    };
  }
  if (raw.includes('unsupported_type')) {
    return {
      title: 'Это не похоже на фото',
      sub:   'Загрузите изображение — JPG, PNG или снимок прямо с камеры.',
    };
  }
  if (raw.startsWith('upload ')) {
    return {
      title: 'Файл не загрузился в хранилище',
      sub:   'Проверьте интернет и попробуйте снова.',
    };
  }
  if (raw.includes('Load failed') || raw.includes('Failed to fetch') || raw.includes('NetworkError') || raw.includes('network')) {
    return {
      title: 'Нет связи с сервером',
      sub:   'Похоже, на секунду пропал интернет или сервер «просыпался». Нажмите «Попробовать снова» — обычно со второго раза проходит.',
    };
  }
  return { title: 'Не удалось завершить запрос', sub: 'Попробуйте подключиться снова. Если ошибка повторяется, напишите в поддержку.' };
}
