-- =========================================================
-- 09_answer_upload_rows_staging
-- Stores full parsed upload rows before normalized import
-- =========================================================

create table if not exists public.answer_upload_rows (
  id uuid primary key default gen_random_uuid(),

  exam_id uuid not null references public.exams(id) on delete cascade,
  upload_id uuid not null references public.answer_uploads(id) on delete cascade,

  source_row_index integer not null
    check (source_row_index >= 0),

  first_name text,
  last_name text,
  id_number text,
  email text,

  raw_row jsonb not null default '{}'::jsonb,

  parsed_answers jsonb not null default '[]'::jsonb,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  unique (upload_id, source_row_index)
);

create index if not exists answer_upload_rows_exam_id_idx
on public.answer_upload_rows(exam_id);

create index if not exists answer_upload_rows_upload_id_idx
on public.answer_upload_rows(upload_id);

create index if not exists answer_upload_rows_email_idx
on public.answer_upload_rows(email);

drop trigger if exists set_answer_upload_rows_updated_at
on public.answer_upload_rows;

create trigger set_answer_upload_rows_updated_at
before update on public.answer_upload_rows
for each row
execute function public.set_updated_at();

alter table public.answer_upload_rows enable row level security;

grant select, insert, update, delete
on public.answer_upload_rows
to authenticated;