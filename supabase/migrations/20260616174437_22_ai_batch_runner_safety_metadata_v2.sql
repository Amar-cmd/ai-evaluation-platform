-- =========================================================
-- 22_ai_batch_runner_safety_metadata_v2
-- Safer AI batch runner metadata for evaluations.
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
'AI provider used for the latest evaluation attempt.';

comment on column public.evaluations.ai_model is
'AI model used for the latest evaluation attempt.';

comment on column public.evaluations.ai_error_message is
'Latest AI evaluation error. If present with status pending, the item can be retried.';

comment on column public.evaluations.ai_attempt_count is
'Number of AI evaluation attempts made for this row.';

comment on column public.evaluations.ai_last_attempt_at is
'Timestamp of latest AI evaluation attempt.';