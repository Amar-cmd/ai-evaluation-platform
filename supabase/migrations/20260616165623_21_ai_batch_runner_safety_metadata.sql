-- =========================================================
-- 21_ai_batch_runner_safety_metadata
-- Adds provider, model, attempt, and error tracking for safer AI batch runs.
--
-- Important:
-- We do not change evaluation status values here because existing status
-- constraints may already be in use. Failed AI attempts remain status='pending'
-- with ai_error_message filled, so they can be retried safely.
-- =========================================================

alter table public.evaluations
add column if not exists ai_provider text;

alter table public.evaluations
add column if not exists ai_model text;

alter table public.evaluations
add column if not exists ai_error_message text;

alter table public.evaluations
add column if not exists ai_attempt_count integer not null default 0
check (ai_attempt_count >= 0);

alter table public.evaluations
add column if not exists ai_last_attempt_at timestamptz;

create index if not exists evaluations_ai_provider_idx
on public.evaluations(ai_provider);

create index if not exists evaluations_ai_model_idx
on public.evaluations(ai_model);

create index if not exists evaluations_ai_attempt_count_idx
on public.evaluations(ai_attempt_count);

create index if not exists evaluations_pending_clean_ai_idx
on public.evaluations(exam_id, status)
where status = 'pending'
  and ai_error_message is null;

create index if not exists evaluations_pending_failed_ai_idx
on public.evaluations(exam_id, status)
where status = 'pending'
  and ai_error_message is not null;

comment on column public.evaluations.ai_provider is
'AI provider used for this evaluation attempt, e.g. mock, openrouter.';

comment on column public.evaluations.ai_model is
'AI model used for this evaluation attempt.';

comment on column public.evaluations.ai_error_message is
'Latest AI evaluation error. If present with status pending, the item can be retried.';

comment on column public.evaluations.ai_attempt_count is
'Number of AI evaluation attempts made for this evaluation row.';

comment on column public.evaluations.ai_last_attempt_at is
'Timestamp of latest AI evaluation attempt.';