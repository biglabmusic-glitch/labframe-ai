-- Расширяем jobs тремя полями для AI-агента (L1: память):
--   prompt_used / model_used / agent_notes — что агент сгенерил и почему.
-- И двумя forward-compat полями для L2/L3 (фидбэк и регенерация):
--   feedback / parent_job_id — пока не используются на бэке, чтобы при переходе
--   на L2 не делать ещё одну миграцию на проде.
--
-- См. CLAUDE.md / brainstorming sec.: «Дизайн системы памяти AI-агента».
alter table public.jobs
  add column if not exists prompt_used   text,
  add column if not exists model_used    text,
  add column if not exists agent_notes   text,
  add column if not exists feedback      text check (feedback in ('liked','disliked','regenerated')),
  add column if not exists parent_job_id uuid references public.jobs(id) on delete set null;

-- Индекс для быстрого выбора последних N done-jobs юзера (использует агент).
-- Покрывает оба основных поиска: «история юзера» и «лента done».
create index if not exists idx_jobs_user_done_created
  on public.jobs (user_id, status, created_at desc)
  where status = 'done';
