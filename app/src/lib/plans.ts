// Единый источник правды по тарифам. Используется в ScreenPricing,
// ScreenMyPlan и ScreenPlansCompare — не дублируем тексты в разных местах.

import type { Plan } from '../state/types';

export interface PlanRow {
  id: Plan;
  name: string;
  /** Без валюты и пробелов: '0' | '2000' | '4500' | '—' */
  priceRaw: string;
  /** Готовая цена с разделителями: '0', '2 000', '4 500', '—'. */
  price: string;
  /** Подсказка ниже названия: '3 обработки', '20 / месяц' и т.п. */
  sub: string;
  /** Бэйдж рекомендуемого тарифа (в UI выделим). */
  recommended?: boolean;
  /** Сводка для карточек ScreenPricing. */
  points: string[];
  /** Подробные значения по фичам — для таблицы сравнения. */
  features: Record<FeatureId, FeatureValue>;
}

export type FeatureId =
  | 'limit'
  | 'formats'
  | 'styles'
  | 'logo'
  | 'brand-save'
  | 'hashtags'
  | 'texts'
  | 'priority'
  | 'team'
  | 'support';

export type FeatureValue = string | true | false;

export interface FeatureSpec {
  id: FeatureId;
  label: string;
  /** Категория для группировки строк в таблице. */
  group: 'Лимит и форматы' | 'Бренд и тексты' | 'Команда и поддержка';
}

export const FEATURES: FeatureSpec[] = [
  { id: 'limit',      label: 'Генераций в месяц',      group: 'Лимит и форматы'  },
  { id: 'formats',    label: 'Форматы (1:1, 4:5, 9:16)', group: 'Лимит и форматы' },
  { id: 'styles',     label: 'Стили оформления',       group: 'Лимит и форматы'  },
  { id: 'logo',       label: 'Логотип в посте',        group: 'Бренд и тексты'   },
  { id: 'brand-save', label: 'Сохранение бренда',      group: 'Бренд и тексты'   },
  { id: 'hashtags',   label: 'Фирменные хэштеги',      group: 'Бренд и тексты'   },
  { id: 'texts',      label: 'Варианты текста к посту', group: 'Бренд и тексты'  },
  { id: 'priority',   label: 'Приоритет генерации',    group: 'Команда и поддержка' },
  { id: 'team',       label: 'Команда',                group: 'Команда и поддержка' },
  { id: 'support',    label: 'Поддержка',              group: 'Команда и поддержка' },
];

export const PLANS: PlanRow[] = [
  {
    id: 'free',
    name: 'Free',
    priceRaw: '0',
    price: '0',
    sub: '3 обработки',
    points: ['1 формат изображения', 'Без сохранения бренда', 'Базовый текст'],
    features: {
      limit:        '3 / месяц',
      formats:      '1 формат',
      styles:       '1 стиль',
      logo:         false,
      'brand-save': false,
      hashtags:     false,
      texts:        '1 короткий',
      priority:     'обычный',
      team:         false,
      support:      'FAQ',
    },
  },
  {
    id: 'start',
    name: 'Start',
    priceRaw: '2000',
    price: '2 000',
    sub: '20 / месяц',
    points: ['Логотип и бренд в посте', 'Все 3 стиля оформления', 'Тексты к постам', 'Сохранение хэштегов'],
    features: {
      limit:        '20 / месяц',
      formats:      'все 3',
      styles:       'все 3',
      logo:         true,
      'brand-save': true,
      hashtags:     true,
      texts:        '3 типа',
      priority:     'обычный',
      team:         false,
      support:      'чат-бот',
    },
  },
  {
    id: 'pro',
    name: 'Pro',
    priceRaw: '4500',
    price: '4 500',
    sub: 'безлимит / месяц',
    recommended: true,
    points: [
      'Безлимит генераций',
      'Все форматы из одной обработки (1:1 + 4:5 + 9:16)',
      'Сохранение бренда и хэштегов',
      'Несколько вариантов текста',
      'Доступ к новым стилям первым',
    ],
    features: {
      limit:        'безлимит',
      formats:      'все из одной обработки',
      styles:       'все + ранний доступ',
      logo:         true,
      'brand-save': true,
      hashtags:     true,
      texts:        '3 типа + альты',
      priority:     'высокий',
      team:         false,
      support:      'приоритетная',
    },
  },
  {
    id: 'lab',
    name: 'Lab',
    priceRaw: '—',
    price: '—',
    sub: 'для команд',
    points: ['Общий бренд лаборатории', 'До 5 сотрудников', 'Командные роли', 'По запросу'],
    features: {
      limit:        'безлимит',
      formats:      'все из одной обработки',
      styles:       'все + ранний доступ',
      logo:         true,
      'brand-save': 'общий бренд',
      hashtags:     true,
      texts:        '3 типа + альты',
      priority:     'высокий',
      team:         'до 5 чел., роли',
      support:      'персональный менеджер',
    },
  },
];

export const PLAN_BY_ID = Object.fromEntries(PLANS.map((p) => [p.id, p])) as Record<Plan, PlanRow>;
