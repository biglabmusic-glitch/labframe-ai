// Единый источник правды по тарифам. Используется в ScreenPricing,
// ScreenMyPlan и ScreenPlansCompare — не дублируем тексты в разных местах.
//
// Два тарифа: Free и Pro (2 000 ₽/мес).
//  • Free — 10 обычных генераций + 5 генераций «с реквизитами» (про-режим) в месяц.
//  • Pro  — всё без ограничений.
// Сейчас идёт демо-период: лимиты не действуют, всё открыто всем (см. feature-flags.ts).

import type { Plan } from '../state/types';

export interface PlanRow {
  id: Plan;
  name: string;
  /** Без валюты и пробелов: '0' | '2000'. */
  priceRaw: string;
  /** Готовая цена с разделителями: '0', '2 000'. */
  price: string;
  /** Подсказка ниже названия: '10 + 5 / месяц' и т.п. */
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
  | 'decor'
  | 'formats'
  | 'styles'
  | 'logo'
  | 'brand-save'
  | 'hashtags'
  | 'texts'
  | 'priority'
  | 'support';

export type FeatureValue = string | true | false;

export interface FeatureSpec {
  id: FeatureId;
  label: string;
  /** Категория для группировки строк в таблице. */
  group: 'Лимит и форматы' | 'Бренд и тексты' | 'Команда и поддержка';
}

export const FEATURES: FeatureSpec[] = [
  { id: 'limit',      label: 'Обычные генерации',          group: 'Лимит и форматы'  },
  { id: 'decor',      label: 'Генерации с реквизитами',    group: 'Лимит и форматы'  },
  { id: 'formats',    label: 'Форматы (1:1, 4:5, 9:16)',   group: 'Лимит и форматы'  },
  { id: 'styles',     label: 'Стили оформления',           group: 'Лимит и форматы'  },
  { id: 'logo',       label: 'Логотип в посте',            group: 'Бренд и тексты'   },
  { id: 'brand-save', label: 'Сохранение бренда',          group: 'Бренд и тексты'   },
  { id: 'hashtags',   label: 'Фирменные хэштеги',          group: 'Бренд и тексты'   },
  { id: 'texts',      label: 'Варианты текста к посту',    group: 'Бренд и тексты'   },
  { id: 'priority',   label: 'Приоритет генерации',        group: 'Команда и поддержка' },
  { id: 'support',    label: 'Поддержка',                  group: 'Команда и поддержка' },
];

export const PLANS: PlanRow[] = [
  {
    id: 'free',
    name: 'Free',
    priceRaw: '0',
    price: '0',
    sub: '10 + 5 / месяц',
    points: [
      '10 обычных генераций в месяц',
      '5 генераций с реквизитами (про-режим)',
      'Все форматы и стили',
      'Базовый текст к посту',
    ],
    features: {
      limit:        '10 / месяц',
      decor:        '5 / месяц',
      formats:      'все',
      styles:       'все',
      logo:         false,
      'brand-save': false,
      hashtags:     false,
      texts:        '1 короткий',
      priority:     'обычный',
      support:      'FAQ',
    },
  },
  {
    id: 'pro',
    name: 'Pro',
    priceRaw: '2000',
    price: '2 000',
    sub: 'безлимит / месяц',
    recommended: true,
    points: [
      'Безлимит обычных генераций',
      'Безлимит генераций с реквизитами',
      'Все форматы из одной обработки (1:1 + 4:5 + 9:16)',
      'Логотип и бренд в посте, фирменные хэштеги',
      'Несколько вариантов текста',
      'Доступ к новым стилям первым',
    ],
    features: {
      limit:        'безлимит',
      decor:        'безлимит',
      formats:      'все из одной обработки',
      styles:       'все + ранний доступ',
      logo:         true,
      'brand-save': true,
      hashtags:     true,
      texts:        '3 типа + альты',
      priority:     'высокий',
      support:      'приоритетная',
    },
  },
];

export const PLAN_BY_ID = Object.fromEntries(PLANS.map((p) => [p.id, p])) as Record<Plan, PlanRow>;

/** Безопасный доступ к тарифу: неизвестный/устаревший план → Free. */
export function planById(id: string | undefined | null): PlanRow {
  return (id && PLAN_BY_ID[id as Plan]) || PLAN_BY_ID.free;
}
