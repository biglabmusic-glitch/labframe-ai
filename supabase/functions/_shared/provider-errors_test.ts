import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { httpStatus, isAccountProblem, isTransient } from './provider-errors.ts';

const REPLICATE_402 =
  'flux-kontext 402: {"title":"Insufficient credit","detail":"You have insufficient credit to run this model."}';

Deno.test('httpStatus: код берётся из начала сообщения', () => {
  assertEquals(httpStatus('polza 503: overloaded'), 503);
  assertEquals(httpStatus(REPLICATE_402), 402);
  assertEquals(httpStatus('модель не ответила за 60 c'), null);
  assertEquals(httpStatus('polza: no image in response (model=x) :: {}'), null);
});

Deno.test('isTransient: перегрузка и сбои сервера повторяем', () => {
  assertEquals(isTransient('polza 503: The model is overloaded'), true);
  assertEquals(isTransient('polza 500: internal'), true);
  assertEquals(isTransient('polza 429: rate limit'), true);
  assertEquals(isTransient('модель не ответила за 60 c'), true);
  assertEquals(isTransient('error sending request: connection reset'), true);
});

Deno.test('isTransient: число в теле ответа не делает отказ временным', () => {
  assertEquals(isTransient('polza 400: prompt longer than 512 tokens'), false);
  assertEquals(isTransient('polza 400: request timeout must be set'), false);
  assertEquals(isTransient(REPLICATE_402), false);
});

Deno.test('isTransient: дамп ответа после « :: » не читаем', () => {
  assertEquals(
    isTransient('polza: no image in response (model=x) :: {"note":"timeout 500 network"}'),
    false,
  );
});

Deno.test('isAccountProblem: деньги и ключ', () => {
  assertEquals(isAccountProblem(REPLICATE_402), true);
  assertEquals(isAccountProblem('flux-kontext 401: unauthenticated'), true);
  assertEquals(isAccountProblem('polza 403: forbidden'), true);
  assertEquals(isAccountProblem('polza 503: overloaded'), false);
  assertEquals(isAccountProblem('модель не ответила за 60 c'), false);
});
