// screens-aux.jsx — Welcome, Home, My Brand, Examples, Pricing, Photo Help

// ─── Screen — WELCOME / SPLASH ─────────────────────────────────
function ScreenWelcome() {
  return (
    <Phone title="LabFrame AI" mainBtn={{ label: 'Создать первый пост', kind: 'primary', icon: <span style={{ marginRight: 4 }}>{I.spark(16)}</span> }}>
      {/* hero accent card */}
      <div style={{ padding: '8px 16px 16px' }}>
        <div style={{
          position: 'relative', borderRadius: 28, overflow: 'hidden',
          background: 'linear-gradient(180deg, #B8E4EC 0%, #93D5E1 100%)',
          color: 'var(--c-ink)', padding: '20px 18px',
          height: 280,
        }}>
          {/* top row */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <Tag kind="dark" style={{ fontSize: 10, padding: '5px 12px' }}>{I.spark(10, 'var(--c-accent)')} AI · MVP</Tag>
            <CircleBtn size={32} kind="dark">{I.plus(16, 'var(--c-on-dark)')}</CircleBtn>
          </div>
          {/* faux before/after preview */}
          <div style={{
            position: 'absolute', left: 18, right: 18, bottom: 80, top: 70,
            display: 'flex', gap: 8,
          }}>
            <div style={{ flex: 1, borderRadius: 16, background: '#F4F6FB',
              position: 'relative', overflow: 'hidden', display: 'flex',
              alignItems: 'center', justifyContent: 'center', color: 'rgba(15,18,33,0.35)',
              boxShadow: 'inset 0 0 0 1px rgba(15,18,33,0.05)',
            }}>
              {I.tooth(40)}
              <div className="mono" style={{ position: 'absolute', top: 8, left: 8, fontSize: 8, letterSpacing: 1, color: 'rgba(15,18,33,0.5)' }}>ДО</div>
            </div>
            <div style={{ flex: 1, borderRadius: 16, background: 'var(--c-bg)',
              position: 'relative', overflow: 'hidden', display: 'flex',
              alignItems: 'center', justifyContent: 'center', color: 'rgba(239,243,255,0.85)',
            }}>
              {I.tooth(40)}
              <div className="mono" style={{ position: 'absolute', top: 8, left: 8, fontSize: 8, letterSpacing: 1, color: 'var(--c-accent)' }}>ПОСЛЕ</div>
              <div style={{
                position: 'absolute', bottom: 6, right: 6, fontSize: 7, fontWeight: 700,
                letterSpacing: 0.8, color: 'rgba(239,243,255,0.55)',
              }}>LAB</div>
            </div>
          </div>
          {/* bottom text */}
          <div style={{ position: 'absolute', bottom: 18, left: 18, right: 18 }}>
            <div style={{ fontSize: 13, fontWeight: 600, opacity: 0.7 }}>фото с телефона</div>
            <div style={{ fontSize: 13, fontWeight: 600 }}>→ готовый пост в Instagram</div>
          </div>
        </div>
      </div>

      {/* greeting */}
      <div style={{ padding: '4px 24px 16px' }}>
        <h1 style={{
          margin: 0, fontSize: 28, fontWeight: 600, letterSpacing: -0.8, lineHeight: 1.05,
        }}>
          AI-студия для<br/>зубных техников
        </h1>
        <p style={{ margin: '12px 0 0', fontSize: 13.5, color: 'var(--c-on-dark-2)', lineHeight: 1.5 }}>
          Сфотографируйте работу на телефон, загрузите в бот и получите готовый визуал с правильным фоном, светом и текстом к публикации.
        </p>
      </div>

      {/* what we do bullets */}
      <div style={{ padding: '0 16px 20px', display: 'flex', flexDirection: 'column', gap: 6 }}>
        {[
          ['Чистый фон и ровный свет', 'без студии и Lightroom'],
          ['Готовые форматы 4:5, 1:1, 9:16', 'для ленты, портфолио и сторис'],
          ['Логотип и текст к посту', 'с подборкой хэштегов'],
        ].map(([t, s]) => (
          <div key={t} style={{ display: 'flex', alignItems: 'center', gap: 12,
            padding: '10px 14px', borderRadius: 14, background: 'rgba(239,243,255,0.04)' }}>
            <div style={{ width: 4, height: 28, borderRadius: 2, background: 'var(--c-accent)' }} />
            <div>
              <div style={{ fontSize: 13, fontWeight: 600 }}>{t}</div>
              <div style={{ fontSize: 11, color: 'var(--c-on-dark-2)' }}>{s}</div>
            </div>
          </div>
        ))}
      </div>
    </Phone>
  );
}

// ─── Screen — HOME ─────────────────────────────────────────────
function ScreenHome() {
  return (
    <Phone title="LabFrame AI" mainBtn={null} headerVariant="tg">
      {/* greeting */}
      <div style={{ padding: '0 22px 18px', display: 'flex', alignItems: 'center', gap: 12 }}>
        <div style={{
          width: 44, height: 44, borderRadius: 999, background: 'var(--c-card-dd)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 16, fontWeight: 600, color: 'var(--c-accent)',
        }}>ИП</div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 13, color: 'var(--c-on-dark-2)' }}>Привет,</div>
          <div style={{ fontSize: 16, fontWeight: 600, letterSpacing: -0.2 }}>Иван Петров</div>
        </div>
        <Tag kind="ghost">PRO · 21/150</Tag>
      </div>

      {/* huge CTA card */}
      <div style={{ padding: '0 16px 12px' }}>
        <div style={{
          position: 'relative', borderRadius: 28, overflow: 'hidden',
          background: 'var(--c-accent)', color: 'var(--c-ink)',
          padding: '20px 20px 22px', minHeight: 168,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <Tag kind="dark" style={{ fontSize: 10 }}>основной флоу</Tag>
            <CircleBtn size={36} kind="dark">{I.arrow(16, 'var(--c-accent)')}</CircleBtn>
          </div>
          <div style={{ marginTop: 30 }}>
            <div style={{ fontSize: 26, fontWeight: 600, letterSpacing: -0.6, lineHeight: 1.05 }}>Создать пост</div>
            <div style={{ fontSize: 13, opacity: 0.65, marginTop: 6 }}>Фото → стиль → бренд → готово за 20 секунд</div>
          </div>
          {/* faux mini phone */}
          <div style={{
            position: 'absolute', right: -10, bottom: -20,
            width: 90, height: 110, borderRadius: 16, background: 'var(--c-ink)',
            padding: 6, transform: 'rotate(8deg)',
            opacity: 0.55,
          }}>
            <div style={{ width: '100%', height: '100%', borderRadius: 12, background: 'var(--c-card-dd)',
              display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              {I.tooth(28, 'var(--c-accent)')}
            </div>
          </div>
        </div>
      </div>

      {/* 2x2 quick actions */}
      <div style={{ padding: '0 16px 12px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
        {[
          { t: 'Мой бренд',   s: 'Логотип, имя, хэштеги', icon: I.user },
          { t: 'Примеры',     s: 'До / после',            icon: I.grid },
          { t: 'Тарифы',      s: 'Free · Start · Pro',    icon: I.spark },
          { t: 'Помощь',      s: 'Как снимать',           icon: I.cam  },
        ].map(it => (
          <Card key={it.t} kind="dark" pad={14} radius={20}>
            <CircleBtn size={32} kind="ghost">{it.icon(16, 'var(--c-accent)')}</CircleBtn>
            <div style={{ marginTop: 12, fontSize: 14, fontWeight: 600 }}>{it.t}</div>
            <div style={{ fontSize: 11, color: 'var(--c-on-dark-2)', marginTop: 2 }}>{it.s}</div>
          </Card>
        ))}
      </div>

      {/* recent posts */}
      <div style={{ padding: '6px 22px 8px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div className="mono" style={{ fontSize: 10, letterSpacing: 0.6, color: 'var(--c-on-dark-3)' }}>ПОСЛЕДНИЕ</div>
        <span style={{ fontSize: 12, color: 'var(--c-accent)' }}>смотреть все →</span>
      </div>
      <div style={{ padding: '0 16px 18px', display: 'flex', gap: 8, overflowX: 'auto' }} className="phone-scroll">
        {[
          { label: 'Premium Dark · 1:1', bg: '#0F1221' },
          { label: 'Clean White · 4:5',  bg: '#F4F6FB' },
          { label: 'Soft Studio · 9:16', bg: 'linear-gradient(135deg,#D6EEF3,#EFF3FF)' },
        ].map((p, i) => (
          <div key={i} style={{
            flex: '0 0 110px', height: 130, borderRadius: 16, background: p.bg,
            display: 'flex', alignItems: 'flex-end', padding: 8, position: 'relative',
            color: i === 0 ? 'var(--c-on-dark)' : 'var(--c-ink)',
          }}>
            <div style={{
              position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%,-50%)',
              color: i === 0 ? 'rgba(239,243,255,0.7)' : 'rgba(15,18,33,0.6)',
            }}>{I.tooth(34)}</div>
            <div className="mono" style={{ fontSize: 9, letterSpacing: 0.4, opacity: 0.7 }}>{p.label}</div>
          </div>
        ))}
      </div>
    </Phone>
  );
}

// ─── Screen — MY BRAND ────────────────────────────────────────
function ScreenMyBrand() {
  return (
    <Phone title="Мой бренд" mainBtn={{ label: 'Сохранить', kind: 'primary' }}>
      <ScreenIntro
        title="Мой бренд"
        sub="Один раз сохраните данные — бот будет автоматически добавлять их к новым публикациям."
      />

      {/* logo block */}
      <div style={{ padding: '0 16px 12px' }}>
        <Card kind="dark" pad={16} radius={22}>
          <div className="mono" style={{ fontSize: 10, letterSpacing: 0.6, color: 'var(--c-on-dark-3)', marginBottom: 12 }}>ЛОГОТИП</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <div style={{
              width: 72, height: 72, borderRadius: 18, background: 'var(--c-card-l)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: 'var(--c-ink)', fontWeight: 800, fontSize: 22, letterSpacing: -1,
              position: 'relative',
            }}>
              <BrandMark size={36} color="var(--c-ink)" />
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 14, fontWeight: 600 }}>petrov_lab_logo.png</div>
              <div style={{ fontSize: 11, color: 'var(--c-on-dark-2)', marginTop: 2 }}>загружен 12 марта · 256 КБ</div>
              <div style={{ display: 'flex', gap: 6, marginTop: 10 }}>
                <Pill size="sm" kind="ghost" icon={I.refresh(12)}>заменить</Pill>
                <Pill size="sm" kind="ghost">удалить</Pill>
              </div>
            </div>
          </div>
        </Card>
      </div>

      {/* fields */}
      <div style={{ padding: '0 16px 12px', display: 'flex', flexDirection: 'column', gap: 8 }}>
        {[
          { lbl: 'Имя мастера',       val: 'Керамист Иван Петров' },
          { lbl: 'Название лаборатории', val: 'Petrov Ceramic Lab' },
        ].map(f => (
          <div key={f.lbl} style={{
            padding: '14px 16px', borderRadius: 18, background: 'var(--c-card-d)',
            border: '1px solid var(--c-line)',
          }}>
            <div className="mono" style={{ fontSize: 10, letterSpacing: 0.6, color: 'var(--c-on-dark-3)' }}>{f.lbl.toUpperCase()}</div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 4 }}>
              <span style={{ fontSize: 15, fontWeight: 500 }}>{f.val}</span>
              <span style={{ color: 'var(--c-on-dark-3)' }}>{I.edit(14)}</span>
            </div>
          </div>
        ))}
      </div>

      {/* preferences */}
      <div style={{ padding: '0 16px 12px' }}>
        <Card kind="dark" pad={16} radius={22}>
          <div className="mono" style={{ fontSize: 10, letterSpacing: 0.6, color: 'var(--c-on-dark-3)', marginBottom: 12 }}>ПРЕДПОЧТЕНИЯ</div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
            <span style={{ fontSize: 13 }}>Стиль по умолчанию</span>
            <Pill size="sm" kind="accent">Premium Dark</Pill>
          </div>
          <div style={{ height: 1, background: 'var(--c-line)', margin: '4px 0 12px' }} />
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: 13 }}>Размещение логотипа</span>
            <Pill size="sm" kind="ghost">нижний правый</Pill>
          </div>
        </Card>
      </div>

      {/* hashtags */}
      <div style={{ padding: '0 16px 20px' }}>
        <Card kind="dark" pad={16} radius={22}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
            <div className="mono" style={{ fontSize: 10, letterSpacing: 0.6, color: 'var(--c-on-dark-3)' }}>ФИРМЕННЫЕ ХЭШТЕГИ · 6</div>
            <span style={{ color: 'var(--c-accent)' }}>{I.plus(14)}</span>
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {['#petrov_lab', '#керамика', '#виниры', '#eMax', '#dentalart', '#ceramist'].map(h => (
              <Tag key={h} kind="ghost" style={{ fontSize: 11 }}>{h}</Tag>
            ))}
          </div>
        </Card>
      </div>
    </Phone>
  );
}

// ─── Screen — EXAMPLES ───────────────────────────────────────
function ScreenExamples() {
  const filters = ['Все', 'Clean White', 'Premium Dark', 'Soft Studio'];
  const items = [
    { style: 'Premium Dark', type: 'Виниры', bg: '#0F1221', dark: true },
    { style: 'Clean White',  type: 'Коронка', bg: '#F4F6FB' },
    { style: 'Soft Studio',  type: 'Мост',    bg: 'linear-gradient(135deg,#D6EEF3,#EFF3FF)' },
    { style: 'Premium Dark', type: 'Коронка', bg: '#0F1221', dark: true },
    { style: 'Clean White',  type: 'Виниры',  bg: '#F4F6FB' },
    { style: 'Soft Studio',  type: 'Имплант', bg: 'linear-gradient(135deg,#EFF3FF,#D6EEF3)' },
  ];

  return (
    <Phone title="Примеры" mainBtn={{ label: 'Создать такой же пост', kind: 'primary' }}>
      <ScreenIntro
        title="Примеры работ"
        sub="Реальные обработки от мастеров. Любой пример можно повторить в один тап."
      />

      {/* filter chips */}
      <div style={{ padding: '0 22px 14px', display: 'flex', gap: 6, overflowX: 'auto' }} className="phone-scroll">
        {filters.map((f, i) => (
          <Pill key={f} size="sm" kind={i === 0 ? 'accent' : 'ghost'}>{f}</Pill>
        ))}
      </div>

      {/* highlight before/after */}
      <div style={{ padding: '0 16px 14px' }}>
        <Card kind="dark" pad={12} radius={22}>
          <div style={{ display: 'flex', gap: 8 }}>
            <div style={{ flex: 1, position: 'relative', borderRadius: 14, overflow: 'hidden',
              background: '#7A7E89', height: 130,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <div style={{ color: 'rgba(15,18,33,0.35)' }}>{I.tooth(40)}</div>
              <div className="mono" style={{ position: 'absolute', top: 8, left: 8, fontSize: 9,
                letterSpacing: 0.8, color: 'rgba(239,243,255,0.85)' }}>ДО</div>
            </div>
            <div style={{ flex: 1, position: 'relative', borderRadius: 14, overflow: 'hidden',
              background: 'var(--c-bg)', height: 130,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <div style={{ color: 'rgba(239,243,255,0.85)' }}>{I.tooth(40)}</div>
              <div className="mono" style={{ position: 'absolute', top: 8, left: 8, fontSize: 9,
                letterSpacing: 0.8, color: 'var(--c-accent)' }}>ПОСЛЕ</div>
              <div style={{ position: 'absolute', bottom: 6, right: 8, fontSize: 7, fontWeight: 700,
                letterSpacing: 0.8, color: 'rgba(239,243,255,0.55)' }}>LAB</div>
            </div>
          </div>
          <div style={{ marginTop: 12, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div>
              <div style={{ fontSize: 13, fontWeight: 600 }}>Premium Dark · Виниры</div>
              <div style={{ fontSize: 11, color: 'var(--c-on-dark-2)' }}>обработка 14 сек</div>
            </div>
            <Pill size="sm" kind="accent">повторить</Pill>
          </div>
        </Card>
      </div>

      {/* grid */}
      <div style={{ padding: '4px 16px 18px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
        {items.map((it, i) => (
          <div key={i} style={{
            position: 'relative', height: 130, borderRadius: 18, background: it.bg, overflow: 'hidden',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: it.dark ? 'rgba(239,243,255,0.7)' : 'rgba(15,18,33,0.6)',
          }}>
            {I.tooth(40)}
            <div style={{
              position: 'absolute', top: 8, left: 8, padding: '3px 8px',
              background: it.dark ? 'rgba(15,18,33,0.55)' : 'rgba(255,255,255,0.85)',
              borderRadius: 999, fontSize: 9, fontWeight: 500,
              color: it.dark ? 'var(--c-on-dark)' : 'var(--c-ink)',
            }}>{it.style}</div>
            <div className="mono" style={{
              position: 'absolute', bottom: 8, left: 10, fontSize: 9, letterSpacing: 0.4,
              opacity: 0.6,
            }}>{it.type}</div>
          </div>
        ))}
      </div>
    </Phone>
  );
}

// ─── Screen — PRICING ────────────────────────────────────────
function ScreenPricing() {
  const plans = [
    {
      id: 'free', name: 'Free Test', price: '0', sub: '3 обработки', kind: 'ghost',
      points: ['1 формат изображения', 'Без сохранения бренда', 'Базовый текст'],
    },
    {
      id: 'start', name: 'Start', price: '590', sub: '30 / месяц', kind: 'dark',
      points: ['Логотип в профиле', 'Тексты к постам', 'Основные форматы'],
    },
    {
      id: 'pro', name: 'Pro', price: '1 490', sub: '150 / месяц', kind: 'accent', selected: true,
      points: ['Все форматы из одной обработки', 'Сохранение бренда и хэштегов', 'Несколько вариантов текста', 'Доступ к новым стилям'],
    },
    {
      id: 'lab', name: 'Lab', price: '3 900', sub: 'до 5 сотрудников', kind: 'dark',
      points: ['Общий бренд лаборатории', 'Большой лимит', 'Командные роли'],
    },
  ];

  return (
    <Phone title="Тарифы" mainBtn={{ label: 'Подключить Pro — 1 490 ₽ / мес', kind: 'primary' }}>
      <ScreenIntro
        title="Тарифы"
        sub="Платите только за обработки. Без подписок на год и скрытых лимитов."
      />

      {/* toggle */}
      <div style={{ padding: '0 22px 14px', display: 'flex', justifyContent: 'center' }}>
        <div style={{
          display: 'inline-flex', padding: 4, borderRadius: 999,
          background: 'rgba(239,243,255,0.06)', border: '1px solid var(--c-line)',
        }}>
          <Pill size="sm" kind="accent">месяц</Pill>
          <Pill size="sm" kind="ghost" style={{ background: 'transparent', border: 'none' }}>
            год · −20%
          </Pill>
        </div>
      </div>

      {/* plan cards */}
      <div style={{ padding: '0 16px 18px', display: 'flex', flexDirection: 'column', gap: 8 }}>
        {plans.map(p => {
          const isAcc = p.kind === 'accent';
          const isGhost = p.kind === 'ghost';
          const bg = isAcc ? 'var(--c-accent)' : isGhost ? 'transparent' : 'var(--c-card-d)';
          const fg = isAcc ? 'var(--c-ink)' : 'var(--c-on-dark)';
          const border = isGhost ? '1px dashed var(--c-line)' : isAcc ? 'none' : '1px solid var(--c-line)';
          return (
            <div key={p.id} style={{ padding: 18, borderRadius: 22, background: bg, color: fg, border, position: 'relative' }}>
              {p.selected && (
                <div style={{
                  position: 'absolute', top: 14, right: 14,
                  fontSize: 10, fontWeight: 700, letterSpacing: 0.8, padding: '4px 10px',
                  background: 'var(--c-ink)', color: 'var(--c-accent)', borderRadius: 999,
                }}>ВЫБРАН</div>
              )}
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginBottom: 4 }}>
                <div style={{ fontSize: 17, fontWeight: 600, letterSpacing: -0.3 }}>{p.name}</div>
                <div style={{ fontSize: 11, opacity: 0.55 }}>· {p.sub}</div>
              </div>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 4, marginBottom: 12 }}>
                <span style={{ fontSize: 32, fontWeight: 600, letterSpacing: -1.2 }}>{p.price}</span>
                <span style={{ fontSize: 13, opacity: 0.55 }}>₽ / мес</span>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                {p.points.map(pt => (
                  <div key={pt} style={{ display: 'flex', gap: 8, alignItems: 'flex-start', fontSize: 12.5 }}>
                    <span style={{ marginTop: 2, opacity: 0.75 }}>{I.check(13, 'currentColor')}</span>
                    <span style={{ opacity: 0.85 }}>{pt}</span>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </Phone>
  );
}

// ─── Screen — PHOTO HELP ────────────────────────────────────
function ScreenPhotoHelp() {
  const tips = [
    { t: 'Снимайте без сильного зума', s: 'Подойдите ближе телом, а не зумом.' },
    { t: 'Не используйте жёлтый свет', s: 'Лучше дневной свет от окна или белая лампа.' },
    { t: 'Избегайте бликов и пересветов', s: 'Если зеркалит — смените угол на 10–15°.' },
    { t: 'Держите работу в фокусе', s: 'Тапните на объект перед съёмкой.' },
    { t: 'Снимайте на нейтральном фоне', s: 'Белый, серый или чёрный матовый.' },
    { t: 'Не обрезайте важные части', s: 'Бот сам кадрирует под нужный формат.' },
    { t: 'Делайте несколько ракурсов', s: 'Для карусели — фронт, ¾, изоляция.' },
  ];
  return (
    <Phone title="Помощь по фото" mainBtn={{ label: 'Понятно, загружаю фото', kind: 'primary' }}>
      <ScreenIntro
        title="Как снимать, чтобы результат был лучше"
        sub="7 коротких правил. Чем чище исходник, тем сильнее AI улучшает подачу."
      />

      {/* good vs bad sample */}
      <div style={{ padding: '0 16px 16px', display: 'flex', gap: 8 }}>
        <div style={{ flex: 1, borderRadius: 18, padding: 12, background: 'var(--c-card-d)',
          border: '1px solid var(--c-line)' }}>
          <div style={{ height: 90, borderRadius: 12, background: '#7C5A2E',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: 'rgba(239,243,255,0.6)', marginBottom: 10, position: 'relative', overflow: 'hidden',
          }}>
            {I.tooth(36)}
            <div style={{ position: 'absolute', inset: 0,
              background: 'radial-gradient(circle at 40% 30%, rgba(255,255,255,0.4), transparent 50%)' }} />
          </div>
          <div className="mono" style={{ fontSize: 10, letterSpacing: 0.6, color: '#E89B7E' }}>ПЛОХО</div>
          <div style={{ fontSize: 12, marginTop: 4, color: 'var(--c-on-dark-2)' }}>Жёлтый свет, пересвет</div>
        </div>
        <div style={{ flex: 1, borderRadius: 18, padding: 12, background: 'var(--c-card-l)',
          color: 'var(--c-ink)' }}>
          <div style={{ height: 90, borderRadius: 12, background: '#E2E7F0',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: 'rgba(15,18,33,0.55)', marginBottom: 10,
          }}>{I.tooth(36)}</div>
          <div className="mono" style={{ fontSize: 10, letterSpacing: 0.6, color: '#2E8467' }}>ХОРОШО</div>
          <div style={{ fontSize: 12, marginTop: 4, color: 'var(--c-on-light-2)' }}>Нейтральный свет, в фокусе</div>
        </div>
      </div>

      {/* tips */}
      <div style={{ padding: '0 16px 20px', display: 'flex', flexDirection: 'column', gap: 6 }}>
        {tips.map((tip, i) => (
          <div key={i} style={{
            display: 'flex', gap: 12, padding: '12px 14px', borderRadius: 16,
            background: 'rgba(239,243,255,0.03)',
          }}>
            <div style={{
              width: 26, height: 26, borderRadius: 999, background: 'var(--c-accent)',
              color: 'var(--c-ink)', display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 12, fontWeight: 700, flexShrink: 0,
            }}>{i + 1}</div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 13.5, fontWeight: 600 }}>{tip.t}</div>
              <div style={{ fontSize: 11.5, color: 'var(--c-on-dark-2)', marginTop: 2, lineHeight: 1.4 }}>{tip.s}</div>
            </div>
          </div>
        ))}
      </div>
    </Phone>
  );
}

Object.assign(window, {
  ScreenWelcome, ScreenHome, ScreenMyBrand,
  ScreenExamples, ScreenPricing, ScreenPhotoHelp,
});
