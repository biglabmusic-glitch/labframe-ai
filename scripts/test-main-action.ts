import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { createMainActionStore } from '../app/src/telegram/main-action-store.ts';
Deno.test('screen actions remain clickable and stale route cleanup cannot erase the next action', () => {
  const store = createMainActionStore(); let clicked = '';
  const first = store.publish({ text: 'Начать', onClick: () => { clicked = 'welcome'; } });
  store.getSnapshot()?.onClick(); assertEquals(clicked, 'welcome');
  const second = store.publish({ text: 'Продолжить', onClick: () => { clicked = 'next'; }, enabled: false });
  first(); assertEquals(store.getSnapshot()?.text, 'Продолжить');
  assertEquals(store.getSnapshot()?.enabled, false);
  second(); assertEquals(store.getSnapshot(), null);
});
Deno.test('hidden actions, progress and StrictMode setup/cleanup preserve their states', () => {
  const store = createMainActionStore(); let changes = 0;
  const stop = store.subscribe(() => { changes++; });
  const release = store.publish({ text: 'Подождите', onClick() {}, progress: true });
  assertEquals(store.getSnapshot()?.progress, true); release();
  store.publish({ text: 'Скрыто', onClick() {}, visible: false });
  assertEquals(store.getSnapshot(), null);
  const fresh = store.publish({ text: 'Начать', onClick() {} });
  assertEquals(store.getSnapshot()?.text, 'Начать'); fresh(); stop();
  assertEquals(changes, 4);
});
