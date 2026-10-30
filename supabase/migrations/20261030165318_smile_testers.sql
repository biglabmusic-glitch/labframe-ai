-- Отдельное разрешение на закрытый пилот, без доступа к админке.
alter table public.users
  add column if not exists smile_tester boolean not null default false;

comment on column public.users.smile_tester is
  'Доступ к пилоту «Примерить улыбку». Выдаётся админом; banned всегда запрещает доступ.';

-- Права users остаются серверными: новые grants для anon/authenticated не нужны.
