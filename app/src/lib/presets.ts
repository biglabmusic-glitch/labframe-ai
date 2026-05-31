// UI-список декор-пресетов. id синхронны с бэком (supabase/functions/_shared/decor.ts).
// Тексты surface/addition живут на бэке — фронт их не дублирует.
export interface DecorPresetUI {
  id: string;
  ru: string;
  desc: string;
}

export const DECOR_PRESETS_UI: DecorPresetUI[] = [
  { id: 'snake',       ru: 'Белая змея',   desc: 'Чёрный камень и белая змея рядом.' },
  { id: 'amethyst',    ru: 'Аметист',      desc: 'Тёмный мрамор и друза аметиста.' },
  { id: 'calligraphy', ru: 'Каллиграфия',  desc: 'Чёрный бархат, кисти и иероглифы.' },
  { id: 'water',       ru: 'Вода',         desc: 'Гладь воды с лёгкими бликами.' },
  { id: 'stone',       ru: 'Камень',       desc: 'Матовая керамика и каменный акцент.' },
  { id: 'metal',       ru: 'Металл',       desc: 'Браш-металл и премиальный поднос.' },
];

export const DECOR_CUSTOM_ID = 'custom';
