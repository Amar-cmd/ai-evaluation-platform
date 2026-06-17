-- =========================================================
-- rollback_21_ai_batch_runner_safety_metadata
-- Undo metadata added by 21_ai_batch_runner_safety_metadata
-- =========================================================

drop index if exists public.evaluations_pending_failed_ai_idx;
drop index if exists public.evaluations_pending_clean_ai_idx;
drop index if exists public.evaluations_ai_attempt_count_idx;
drop index if exists public.evaluations_ai_model_idx;
drop index if exists public.evaluations_ai_provider_idx;

alter table public.evaluations
drop column if exists ai_last_attempt_at;

alter table public.evaluations
drop column if exists ai_attempt_count;

alter table public.evaluations
drop column if exists ai_error_message;

alter table public.evaluations
drop column if exists ai_model;

alter table public.evaluations
drop column if exists ai_provider;