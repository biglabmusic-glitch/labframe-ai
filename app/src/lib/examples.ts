import type { StyleId } from '../state/types';

/**
 * Эталоны «до/после» по стилям. Файлы лежат в app/public/examples/.
 * Если файла нет — Vite просто отдаст 404 и <img> сломается визуально.
 * Имена жёстко зафиксированы — менять только согласованно с реальными файлами.
 */
export const EXAMPLES: Record<StyleId, { before: string; after: string; label: string }> = {
  clean: { before: '/examples/clean-before.jpg', after: '/examples/clean-after.jpg', label: 'Clean White' },
  dark:  { before: '/examples/dark-before.jpg',  after: '/examples/dark-after.jpg',  label: 'Premium Dark' },
  soft:  { before: '/examples/soft-before.jpg',  after: '/examples/soft-after.jpg',  label: 'Soft Studio' },
};

export const STYLE_ORDER: StyleId[] = ['clean', 'dark', 'soft'];
