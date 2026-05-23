// screens-flow.jsx — main "Создать пост" flow + result + processing

// helper: sectioned title block at top of a screen
function ScreenIntro({ eyebrow, title, sub, light = false, style = {} }) {
  return (
    <div style={{ padding: '8px 22px 18px', ...style }}>
      {eyebrow && (
        <div className="mono" style={{
          fontSize: 11, letterSpacing: 0.6, textTransform: 'uppercase',
          color: light ? 'var(--c-on-light-2)' : 'var(--c-on-dark-3)',
          marginBottom: 12,
        }}>{eyebrow}</div>
      )}
      <h1 style={{
        margin: 0, fontSize: 26, lineHeight: 1.1, fontWeight: 600, letterSpacing: -0.6,
        color: light ? 'var(--c-ink)' : 'var(--c-on-dark)',
        textWrap: 'balance',
      }}>{title}</h1>
      {sub && <p style={{
        margin: '12px 0 0', fontSize: 14, lineHeight: 1.45, fontWeight: 400,
        color: light ? 'var(--c-on-light-2)' : 'var(--c-on-dark-2)',
        textWrap: 'pretty',
      }}>{sub}</p>}
    </div>
  );
}

// numbered step badge "Шаг 2 из 7"
function StepBadge({ n, total, label = 'Шаг' }) {
  return (
    <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '4px 4px 4px 14px',
      borderRadius: 999, background: 'rgba(239,243,255,0.06)', border: '1px solid var(--c-line)',
    }}>
      <span className="mono" style={{ fontSize: 11, color: 'var(--c-on-dark-2)', letterSpacing: 0.5 }}>
        {label}
      </span>
      <span className="mono" style={{
        fontSize: 11, color: 'var(--c-ink)', background: 'var(--c-accent)',
        padding: '4px 10px', borderRadius: 999, fontWeight: 600,
      }}>{n}/{total}</span>
    </div>
  );
}

// ─── Screen 1 — UPLOAD PHOTO ───────────────────────────────────
function ScreenUpload() {
  return (
    <Phone title="Создать пост" mainBtn={{ label: 'Выбрать из галереи', kind: 'primary' }}>
      <div style={{ padding: '4px 22px 14px' }}>
        <StepBadge n={1} total={7} />
      </div>
      <ScreenIntro
        title="Загрузите фото вашей работы"
        sub="Лучше всего подойдут фото на модели, без сильного зума, жёлтого света и пересветов."
      />

      <div style={{ padding: '0 16px 16px' }}>
        {/* drop zone */}
        <div style={{
          height: 260, borderRadius: 28,
          background: 'rgba(239,243,255,0.03)',
          border: '1.5px dashed rgba(147,213,225,0.45)',
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 14,
          position: 'relative', overflow: 'hidden',
        }}>
          <div style={{
            position: 'absolute', inset: 0, opacity: 0.4,
            background: 'radial-gradient(circle at 50% 40%, rgba(147,213,225,0.18), transparent 60%)',
          }} />
          <CircleBtn size={56} kind="accent">{I.img(24)}</CircleBtn>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 15, fontWeight: 600 }}>Перетащите фото сюда</div>
            <div style={{ fontSize: 12, color: 'var(--c-on-dark-2)', marginTop: 4 }}>
              JPG, PNG · до 20 МБ
            </div>
          </div>
        </div>

        {/* secondary actions */}
        <div style={{ display: 'flex', gap: 10, marginTop: 12 }}>
          <Card kind="ghost" pad={14} radius={18} style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 10 }}>
            {I.cam(20, 'var(--c-accent)')}
            <span style={{ fontSize: 13, fontWeight: 500 }}>Снять сейчас</span>
          </Card>
          <Card kind="ghost" pad={14} radius={18} style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 10 }}>
            {I.history(20, 'var(--c-accent)')}
            <span style={{ fontSize: 13, fontWeight: 500 }}>История</span>
          </Card>
        </div>

        {/* tip */}
        <Card kind="dark" pad={14} radius={18} style={{ marginTop: 12, display: 'flex', gap: 12, alignItems: 'flex-start' }}>
          <CircleBtn size={32} kind="accent">{I.spark(14)}</CircleBtn>
          <div>
            <div style={{ fontSize: 12.5, fontWeight: 600, marginBottom: 2 }}>AI улучшает подачу, не работу</div>
            <div style={{ fontSize: 11.5, color: 'var(--c-on-dark-2)', lineHeight: 1.4 }}>
              Меняем фон, свет и кадр. Форма, цвет и анатомия остаются как у вас.
            </div>
          </div>
        </Card>
      </div>
    </Phone>
  );
}

// ─── Screen 2 — WORK TYPE ───────────────────────────────────────
function ScreenWorkType() {
  const types = [
    { id: 'crown',  label: 'Коронка',       hint: 'одиночная' },
    { id: 'veneer', label: 'Виниры',        hint: 'фронтальный сегмент', selected: true },
    { id: 'bridge', label: 'Мост',          hint: '3+ единицы' },
    { id: 'other',  label: 'Другая работа', hint: 'имплант, абатмент…' },
  ];
  return (
    <Phone title="Создать пост" mainBtn={{ label: 'Далее', kind: 'primary' }}>
      <div style={{ padding: '4px 22px 14px' }}>
        <StepBadge n={2} total={7} />
      </div>
      <ScreenIntro
        title="Что изображено на фото?"
        sub="Тип работы помогает подобрать точный текст к посту и хэштеги."
      />

      {/* uploaded photo preview */}
      <div style={{ padding: '0 22px 20px' }}>
        <div style={{
          display: 'flex', alignItems: 'center', gap: 12, padding: 8, paddingRight: 16,
          background: 'rgba(239,243,255,0.04)', borderRadius: 18,
        }}>
          <image-slot id="upload-preview" shape="rounded" radius="14"
            style={{ width: 56, height: 56 }} placeholder="фото работы"></image-slot>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 13, fontWeight: 600 }}>work_2412_03.jpg</div>
            <div style={{ fontSize: 11, color: 'var(--c-on-dark-2)' }}>3.2 МБ · 4032×3024</div>
          </div>
          <span style={{ color: 'var(--c-accent)' }}>{I.check(18)}</span>
        </div>
      </div>

      {/* type chips */}
      <div style={{ padding: '0 16px 16px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
        {types.map(t => (
          <div key={t.id} style={{
            padding: 16, borderRadius: 20,
            background: t.selected ? 'var(--c-accent)' : 'var(--c-card-d)',
            color: t.selected ? 'var(--c-ink)' : 'var(--c-on-dark)',
            border: t.selected ? 'none' : '1px solid var(--c-line)',
            position: 'relative',
          }}>
            <div style={{ fontSize: 16, fontWeight: 600, letterSpacing: -0.2 }}>{t.label}</div>
            <div style={{ fontSize: 11.5, marginTop: 4, opacity: t.selected ? 0.7 : 0.55 }}>{t.hint}</div>
            {t.selected && (
              <div style={{ position: 'absolute', top: 12, right: 12 }}>
                <CircleBtn size={22} kind="dark" style={{ background: 'var(--c-ink)' }}>
                  {I.check(13, 'var(--c-accent)')}
                </CircleBtn>
              </div>
            )}
          </div>
        ))}
        {/* skip row */}
        <div style={{
          gridColumn: '1 / -1', padding: 16, borderRadius: 20, border: '1px dashed var(--c-line)',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          color: 'var(--c-on-dark-2)',
        }}>
          <span style={{ fontSize: 14 }}>Пропустить шаг</span>
          {I.arrow(18, 'currentColor')}
        </div>
      </div>
    </Phone>
  );
}

// ─── Screen 3 — STYLE CHOICE ───────────────────────────────────
function ScreenStyle() {
  const styles_ = [
    {
      id: 'clean',  name: 'Clean White',  ru: 'Чистый светлый',
      desc: 'Светлый чистый фон, медицинская подача.',
      preview: 'light', accent: '#EFF3FF', text: 'var(--c-ink)',
    },
    {
      id: 'dark',   name: 'Premium Dark', ru: 'Премиальный',
      desc: 'Тёмный контрастный фон, дорогой визуал.',
      preview: 'dark', accent: '#0F1221', text: 'var(--c-on-dark)', selected: true,
    },
    {
      id: 'soft',   name: 'Soft Studio',  ru: 'Мягкая студия',
      desc: 'Студийный свет, спокойная эстетика.',
      preview: 'soft', accent: '#93D5E1', text: 'var(--c-ink)',
    },
  ];

  // little preview swatch
  const Preview = ({ kind }) => {
    const bg = kind === 'light' ? '#F4F6FB' : kind === 'dark' ? '#0F1221' : 'linear-gradient(135deg,#D6EEF3 0%,#EFF3FF 100%)';
    return (
      <div style={{
        width: 86, height: 86, borderRadius: 18, background: bg, flexShrink: 0,
        position: 'relative', overflow: 'hidden',
        boxShadow: 'inset 0 0 0 1px rgba(15,18,33,0.06)',
      }}>
        {/* faux tooth */}
        <div style={{
          position: 'absolute', left: '50%', top: '52%', transform: 'translate(-50%,-50%)',
          color: kind === 'dark' ? 'rgba(239,243,255,0.85)' : 'rgba(15,18,33,0.75)',
        }}>{I.tooth(40)}</div>
        {/* fake brand mark in corner */}
        <div style={{
          position: 'absolute', bottom: 8, right: 8,
          fontSize: 7, letterSpacing: 0.5, fontWeight: 600,
          color: kind === 'dark' ? 'rgba(239,243,255,0.6)' : 'rgba(15,18,33,0.4)',
        }}>LAB</div>
      </div>
    );
  };

  return (
    <Phone title="Создать пост" mainBtn={{ label: 'Применить Premium Dark', kind: 'primary' }}>
      <div style={{ padding: '4px 22px 14px' }}>
        <StepBadge n={3} total={7} />
      </div>
      <ScreenIntro title="Выберите стиль оформления" sub="Стиль задаёт фон, свет и общую визуальную подачу." />

      <div style={{ padding: '0 16px 16px', display: 'flex', flexDirection: 'column', gap: 10 }}>
        {styles_.map(s => (
          <div key={s.id} style={{
            display: 'flex', gap: 14, alignItems: 'center', padding: 12, paddingRight: 16,
            borderRadius: 22, background: s.selected ? 'var(--c-card-l)' : 'var(--c-card-d)',
            color: s.selected ? 'var(--c-ink)' : 'var(--c-on-dark)',
            border: s.selected ? 'none' : '1px solid var(--c-line)',
            position: 'relative',
          }}>
            <Preview kind={s.preview} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 15, fontWeight: 600, letterSpacing: -0.2 }}>{s.name}</div>
              <div style={{ fontSize: 11, fontWeight: 500, opacity: 0.6, marginTop: 2, marginBottom: 6 }}>{s.ru}</div>
              <div style={{ fontSize: 11.5, opacity: s.selected ? 0.7 : 0.55, lineHeight: 1.35 }}>{s.desc}</div>
            </div>
            <div style={{
              width: 22, height: 22, borderRadius: 999,
              background: s.selected ? 'var(--c-ink)' : 'transparent',
              border: s.selected ? 'none' : '1.5px solid rgba(239,243,255,0.25)',
              display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
            }}>
              {s.selected && I.check(13, 'var(--c-accent)')}
            </div>
          </div>
        ))}
      </div>
    </Phone>
  );
}

// ─── Screen 4 — BRAND ───────────────────────────────────────────
function ScreenBranding() {
  return (
    <Phone title="Создать пост" mainBtn={{ label: 'Далее', kind: 'primary' }}>
      <div style={{ padding: '4px 22px 14px' }}>
        <StepBadge n={4} total={7} />
      </div>
      <ScreenIntro title="Добавить логотип или имя мастера?" sub="Бренд автоматически разместится в углу изображения." />

      {/* saved brand chip */}
      <div style={{ padding: '0 22px 18px' }}>
        <Card kind="dark" pad={12} radius={20} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{
            width: 44, height: 44, borderRadius: 14, background: 'var(--c-accent)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 16, fontWeight: 700, color: 'var(--c-ink)', letterSpacing: -0.5,
          }}>ИП</div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="mono" style={{ fontSize: 10, color: 'var(--c-on-dark-3)', letterSpacing: 0.5 }}>СОХРАНЁННЫЙ БРЕНД</div>
            <div style={{ fontSize: 14, fontWeight: 600, marginTop: 2 }}>Керамист Иван Петров</div>
          </div>
          <Pill size="sm" kind="ghost">изменить</Pill>
        </Card>
      </div>

      <div style={{ padding: '0 16px 16px', display: 'flex', flexDirection: 'column', gap: 10 }}>
        {/* logo */}
        <div style={{
          padding: 16, borderRadius: 22, background: 'var(--c-accent)', color: 'var(--c-ink)',
          display: 'flex', alignItems: 'center', gap: 14,
        }}>
          <CircleBtn size={42} kind="dark">{I.img(20, 'var(--c-accent)')}</CircleBtn>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 15, fontWeight: 600 }}>Добавить логотип</div>
            <div style={{ fontSize: 11.5, opacity: 0.65, marginTop: 2 }}>PNG или JPG · сохранится в профиль</div>
          </div>
          {I.arrow(20, 'currentColor')}
        </div>
        {/* name */}
        <div style={{
          padding: 16, borderRadius: 22, background: 'var(--c-card-d)', border: '1px solid var(--c-line)',
          display: 'flex', alignItems: 'center', gap: 14,
        }}>
          <CircleBtn size={42} kind="ghost">{I.text(20, 'var(--c-accent)')}</CircleBtn>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 15, fontWeight: 600 }}>Добавить имя текстом</div>
            <div style={{ fontSize: 11.5, color: 'var(--c-on-dark-2)', marginTop: 2 }}>Например, «Ceramist Ivan Petrov»</div>
          </div>
          {I.arrow(20, 'var(--c-on-dark-2)')}
        </div>
        {/* none */}
        <div style={{
          padding: 16, borderRadius: 22, background: 'transparent', border: '1px dashed var(--c-line)',
          display: 'flex', alignItems: 'center', gap: 14, color: 'var(--c-on-dark-2)',
        }}>
          <CircleBtn size={42} kind="ghost"><span style={{ fontSize: 18, opacity: 0.6 }}>—</span></CircleBtn>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 15, fontWeight: 500 }}>Без бренда</div>
            <div style={{ fontSize: 11.5, opacity: 0.55, marginTop: 2 }}>Изображение без подписи</div>
          </div>
        </div>
      </div>
    </Phone>
  );
}

// ─── Screen 5 — FORMAT ───────────────────────────────────────────
function ScreenFormat() {
  const formats = [
    { id: '4x5', label: 'Instagram', ratio: '4:5',  px: '1080×1350', w: 60, h: 75 },
    { id: '1x1', label: 'Квадрат',   ratio: '1:1',  px: '1080×1080', w: 70, h: 70, selected: true },
    { id: '9x16',label: 'Stories',   ratio: '9:16', px: '1080×1920', w: 44, h: 78 },
  ];
  return (
    <Phone title="Создать пост" mainBtn={{ label: 'Далее', kind: 'primary' }}>
      <div style={{ padding: '4px 22px 14px' }}>
        <StepBadge n={5} total={7} />
      </div>
      <ScreenIntro title="В каком формате подготовить изображение?" sub="В Pro и Lab — сразу все форматы из одной обработки." />

      <div style={{ padding: '0 16px 12px', display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
        {formats.map(f => (
          <div key={f.id} style={{
            padding: '16px 10px 14px', borderRadius: 22,
            background: f.selected ? 'var(--c-card-l)' : 'var(--c-card-d)',
            color: f.selected ? 'var(--c-ink)' : 'var(--c-on-dark)',
            border: f.selected ? 'none' : '1px solid var(--c-line)',
            display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10,
          }}>
            <div style={{
              width: f.w, height: f.h, borderRadius: 8,
              background: f.selected ? 'var(--c-ink)' : 'rgba(239,243,255,0.06)',
              border: f.selected ? 'none' : '1px solid rgba(239,243,255,0.12)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <span className="mono" style={{
                fontSize: 11, color: f.selected ? 'var(--c-accent)' : 'var(--c-on-dark-3)',
              }}>{f.ratio}</span>
            </div>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 12.5, fontWeight: 600 }}>{f.label}</div>
              <div className="mono" style={{ fontSize: 9.5, opacity: 0.5, marginTop: 2 }}>{f.px}</div>
            </div>
          </div>
        ))}
      </div>

      {/* all formats banner */}
      <div style={{ padding: '6px 16px 16px' }}>
        <Card kind="deep" pad={14} radius={20} style={{
          display: 'flex', alignItems: 'center', gap: 12,
        }}>
          <div style={{ display: 'flex', gap: -4 }}>
            {[16, 20, 12].map((w, i) => (
              <div key={i} style={{
                width: w, height: 24, borderRadius: 4, marginLeft: i ? -6 : 0,
                background: i === 1 ? 'var(--c-accent)' : 'rgba(239,243,255,0.18)',
                border: '1.5px solid var(--c-card-dd)',
              }} />
            ))}
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 13, fontWeight: 600 }}>Все форматы сразу</div>
            <div style={{ fontSize: 11, color: 'var(--c-on-dark-2)' }}>4:5 + 1:1 + 9:16 одной обработкой</div>
          </div>
          <Tag kind="accent" style={{ fontSize: 10 }}>PRO</Tag>
        </Card>
      </div>
    </Phone>
  );
}

// ─── Screen 6 — TEXT TYPE ───────────────────────────────────────
function ScreenTextType() {
  const variants = [
    { id: 'short', label: 'Короткий', sub: 'Лаконичная подпись',
      sample: '«Керамическая реставрация с акцентом на естественную форму».' },
    { id: 'sell',  label: 'Продающий', sub: 'Эмоциональный, показывает ценность',
      sample: '«Живая игра света и мягкие переходы оттенков помогают…»', selected: true },
    { id: 'tech',  label: 'Технический', sub: 'Фокус на мастерстве и деталях',
      sample: '«Работа с акцентом на макро- и микротекстуру».' },
  ];
  return (
    <Phone title="Создать пост" mainBtn={{ label: 'Сгенерировать пост', kind: 'primary', icon: <span style={{ marginRight: 4 }}>{I.spark(16)}</span> }}>
      <div style={{ padding: '4px 22px 14px' }}>
        <StepBadge n={6} total={7} />
      </div>
      <ScreenIntro title="Текст к публикации" sub="Включает 1–2 альтернативы и подборку хэштегов." />

      <div style={{ padding: '0 16px 12px', display: 'flex', flexDirection: 'column', gap: 10 }}>
        {variants.map(v => (
          <div key={v.id} style={{
            padding: 14, borderRadius: 22,
            background: v.selected ? 'var(--c-accent)' : 'var(--c-card-d)',
            color: v.selected ? 'var(--c-ink)' : 'var(--c-on-dark)',
            border: v.selected ? 'none' : '1px solid var(--c-line)',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
              <div>
                <div style={{ fontSize: 15, fontWeight: 600 }}>{v.label}</div>
                <div style={{ fontSize: 11, opacity: v.selected ? 0.6 : 0.5, marginTop: 1 }}>{v.sub}</div>
              </div>
              <div style={{
                width: 20, height: 20, borderRadius: 999,
                background: v.selected ? 'var(--c-ink)' : 'transparent',
                border: v.selected ? 'none' : '1.5px solid rgba(239,243,255,0.25)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>{v.selected && I.check(12, 'var(--c-accent)')}</div>
            </div>
            <div style={{
              padding: '10px 12px', borderRadius: 12,
              background: v.selected ? 'rgba(15,18,33,0.08)' : 'rgba(15,18,33,0.4)',
              fontSize: 11.5, fontStyle: 'italic', lineHeight: 1.4,
              opacity: v.selected ? 0.85 : 0.7,
            }}>{v.sample}</div>
          </div>
        ))}
        {/* без текста */}
        <div style={{
          padding: '14px 16px', borderRadius: 22, border: '1px dashed var(--c-line)',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          color: 'var(--c-on-dark-2)',
        }}>
          <span style={{ fontSize: 14 }}>Без текста — только изображение</span>
          <div style={{ width: 18, height: 18, borderRadius: 999, border: '1.5px solid rgba(239,243,255,0.25)' }} />
        </div>
      </div>
    </Phone>
  );
}

// ─── Screen 7 — PROCESSING ──────────────────────────────────────
function ScreenProcessing() {
  const steps = [
    { label: 'Анализ фото',        done: true },
    { label: 'Очистка фона',       done: true },
    { label: 'Выравнивание света', done: true },
    { label: 'Кадрирование 1:1',   active: true },
    { label: 'Брендирование',      pending: true },
    { label: 'Генерация текста',   pending: true },
  ];
  return (
    <Phone title="Создать пост" headerVariant="tg">
      <div style={{ padding: '4px 22px 14px' }}>
        <StepBadge n={7} total={7} />
      </div>
      <ScreenIntro title="AI обрабатывает фото..." sub="Обычно занимает 12–20 секунд. Можно свернуть Telegram — пришлём уведомление." />

      {/* big radial progress */}
      <div style={{ display: 'flex', justifyContent: 'center', padding: '8px 0 28px' }}>
        <div style={{ position: 'relative', width: 180, height: 180 }}>
          <svg width="180" height="180" viewBox="0 0 180 180" style={{ transform: 'rotate(-90deg)' }}>
            <circle cx="90" cy="90" r="78" stroke="rgba(239,243,255,0.06)" strokeWidth="10" fill="none"/>
            <circle cx="90" cy="90" r="78" stroke="var(--c-accent)" strokeWidth="10" fill="none"
              strokeDasharray="490" strokeDashoffset="195" strokeLinecap="round"/>
          </svg>
          <div style={{
            position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
            flexDirection: 'column',
          }}>
            <div style={{ fontSize: 38, fontWeight: 600, letterSpacing: -1.5, color: 'var(--c-on-dark)' }}>
              60<span style={{ fontSize: 18, opacity: 0.5 }}>%</span>
            </div>
            <div className="mono" style={{ fontSize: 10, color: 'var(--c-on-dark-3)', letterSpacing: 0.8, marginTop: 2 }}>
              ETA 8 СЕК
            </div>
          </div>
        </div>
      </div>

      {/* steps list */}
      <div style={{ padding: '0 22px 20px', display: 'flex', flexDirection: 'column', gap: 10 }}>
        {steps.map((s, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{
              width: 22, height: 22, borderRadius: 999, flexShrink: 0,
              background: s.done ? 'var(--c-accent)' : s.active ? 'transparent' : 'transparent',
              border: s.active ? '1.5px solid var(--c-accent)' : s.done ? 'none' : '1.5px solid rgba(239,243,255,0.15)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              {s.done && I.check(13, 'var(--c-ink)')}
              {s.active && <div style={{ width: 8, height: 8, borderRadius: 999, background: 'var(--c-accent)' }} />}
            </div>
            <div style={{ flex: 1, fontSize: 14, fontWeight: s.active ? 600 : 400,
              color: s.pending ? 'var(--c-on-dark-3)' : 'var(--c-on-dark)' }}>
              {s.label}
            </div>
            {s.active && <span className="mono" style={{ fontSize: 11, color: 'var(--c-accent)' }}>идёт…</span>}
          </div>
        ))}
      </div>
    </Phone>
  );
}

// ─── Screen 8 — RESULT ──────────────────────────────────────────
function ScreenResult() {
  return (
    <Phone title="Готово" mainBtn={{ label: 'Скачать пост', kind: 'primary', icon: <span style={{ marginRight: 4 }}>{I.download(16)}</span> }}>
      {/* format tabs */}
      <div style={{ padding: '0 22px 14px', display: 'flex', gap: 6 }}>
        {[['1:1', true], ['4:5'], ['9:16']].map(([t, sel], i) => (
          <Pill key={i} size="sm" kind={sel ? 'accent' : 'ghost'}>{t}</Pill>
        ))}
        <div style={{ flex: 1 }} />
        <Pill size="sm" kind="ghost" icon={I.refresh(14)}>другой стиль</Pill>
      </div>

      {/* big result image */}
      <div style={{ padding: '0 16px 14px' }}>
        <div style={{ position: 'relative', borderRadius: 24, overflow: 'hidden' }}>
          <image-slot id="result-1x1" shape="rounded" radius="24"
            style={{ width: '100%', height: 300, display: 'block' }}
            placeholder="готовый кадр 1:1 — Premium Dark"></image-slot>
          {/* fake brand overlay */}
          <div style={{
            position: 'absolute', bottom: 12, right: 12, padding: '6px 10px',
            background: 'rgba(255,255,255,0.92)', borderRadius: 8,
            fontSize: 9, fontWeight: 700, letterSpacing: 1, color: 'var(--c-ink)',
          }}>CERAMIST IVAN PETROV</div>
          <div style={{
            position: 'absolute', top: 12, left: 12, padding: '4px 10px',
            background: 'rgba(15,18,33,0.72)', borderRadius: 999,
            fontSize: 10, fontWeight: 500, color: 'var(--c-on-dark)',
            display: 'flex', alignItems: 'center', gap: 4,
          }}>{I.spark(10, 'var(--c-accent)')} Premium Dark</div>
        </div>
      </div>

      {/* caption card */}
      <div style={{ padding: '0 16px 12px' }}>
        <Card kind="dark" pad={16} radius={22}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
            <div className="mono" style={{ fontSize: 10, letterSpacing: 0.6, color: 'var(--c-on-dark-3)' }}>ТЕКСТ К ПОСТУ · ПРОДАЮЩИЙ</div>
            <Pill size="sm" kind="ghost" icon={I.refresh(12)}>иначе</Pill>
          </div>
          <p style={{ margin: 0, fontSize: 13, lineHeight: 1.5, color: 'var(--c-on-dark)' }}>
            В таких работах важна не только форма, но и ощущение естественности: мягкий переход оттенков, правильная текстура и живая игра света помогают реставрации выглядеть гармонично в улыбке.
          </p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 12 }}>
            {['#керамика', '#виниры', '#эстетика', '#dentallab', '#ceramist'].map(t => (
              <Tag key={t} kind="ghost" style={{ fontSize: 10.5 }}>{t}</Tag>
            ))}
          </div>
        </Card>
      </div>

      {/* secondary actions */}
      <div style={{ padding: '0 16px 14px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
        <Card kind="ghost" pad={12} radius={16} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {I.share(18, 'var(--c-accent)')}
          <span style={{ fontSize: 13, fontWeight: 500 }}>Поделиться</span>
        </Card>
        <Card kind="ghost" pad={12} radius={16} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {I.plus(18, 'var(--c-accent)')}
          <span style={{ fontSize: 13, fontWeight: 500 }}>Новый пост</span>
        </Card>
      </div>
    </Phone>
  );
}

Object.assign(window, {
  ScreenIntro, StepBadge,
  ScreenUpload, ScreenWorkType, ScreenStyle, ScreenBranding,
  ScreenFormat, ScreenTextType, ScreenProcessing, ScreenResult,
});
