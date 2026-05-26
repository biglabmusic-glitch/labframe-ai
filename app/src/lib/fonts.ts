// Каталог шрифтов для подписи бренда на готовых работах.
// Загружаются с Google Fonts через <link> в index.html.
// id → сохраняется в brand.font_id (БД) → попадает в промт агента.
//
// promptDescription — короткое английское описание стиля, которое мы передаём
// AI-модели. Сама модель НЕ может рендерить произвольный шрифт по имени,
// но может имитировать стиль по описанию (serif/sans, тонкий/жирный, classical/modern и т.п.).

export interface FontDef {
  id: string;
  /** Понятное название для юзера. */
  label: string;
  /** Tagline под образцом — описывает характер шрифта. */
  hint: string;
  /** CSS font-family для рендера превью на фронте. */
  cssFamily: string;
  /** Описание для AI-агента (на английском). */
  promptDescription: string;
  /** Категория для группировки/фильтрации. */
  category: 'serif' | 'sans' | 'display';
}

export const FONTS: FontDef[] = [
  {
    id: 'inter',
    label: 'Inter',
    hint: 'Нейтральный, современный',
    cssFamily: "'Inter', system-ui, sans-serif",
    promptDescription: 'modern minimal sans-serif, regular weight, neutral, no character',
    category: 'sans',
  },
  {
    id: 'playfair',
    label: 'Playfair Display',
    hint: 'Премиум, с засечками',
    cssFamily: "'Playfair Display', serif",
    promptDescription: 'classical high-contrast serif with elegant thin strokes, luxury editorial feel',
    category: 'serif',
  },
  {
    id: 'cormorant',
    label: 'Cormorant',
    hint: 'Тонкая, изящная',
    cssFamily: "'Cormorant Garamond', serif",
    promptDescription: 'thin elegant garamond-style serif, refined, delicate, gallery-style',
    category: 'serif',
  },
  {
    id: 'cinzel',
    label: 'Cinzel',
    hint: 'Капителью, дорого',
    cssFamily: "'Cinzel', serif",
    promptDescription: 'classical Roman capitals, all-caps, monumental and premium',
    category: 'display',
  },
  {
    id: 'italiana',
    label: 'Italiana',
    hint: 'Утончённая, женская',
    cssFamily: "'Italiana', serif",
    promptDescription: 'fashion magazine style serif, very thin, italic-like flourish, feminine elegant',
    category: 'display',
  },
  {
    id: 'bodoni',
    label: 'Bodoni Moda',
    hint: 'Высокий контраст, fashion',
    cssFamily: "'Bodoni Moda', serif",
    promptDescription: 'high-contrast Bodoni serif, ultra-thin hairlines, fashion editorial cover style',
    category: 'serif',
  },
  {
    id: 'montserrat',
    label: 'Montserrat',
    hint: 'Геометричный, чистый',
    cssFamily: "'Montserrat', sans-serif",
    promptDescription: 'clean geometric sans-serif, even strokes, modern lifestyle brand feel',
    category: 'sans',
  },
  {
    id: 'tenor',
    label: 'Tenor Sans',
    hint: 'Минимализм, тонкий sans',
    cssFamily: "'Tenor Sans', sans-serif",
    promptDescription: 'minimalist thin sans-serif, wide proportions, gallery and museum signage feel',
    category: 'sans',
  },
];

export const FONTS_BY_ID = Object.fromEntries(FONTS.map((f) => [f.id, f])) as Record<string, FontDef>;

export const DEFAULT_FONT_ID = 'inter';
