-- =========================================================
-- 07_answer_upload_schema
-- Answer upload, imported students, and normalized answers
-- =========================================================

-- ---------------------------------------------------------
-- answer_uploads
-- Stores metadata and parsing/mapping state for uploaded CSV/JSON files.
-- ---------------------------------------------------------
create table if not exists public.answer_uploads (
  id uuid primary key default gen_random_uuid(),

  exam_id uuid not null references public.exams(id) on delete cascade,
  uploaded_by uuid not null references public.profiles(id) on delete restrict,

  file_name text not null,
  file_type text not null
    check (file_type in ('csv', 'json')),

  -- Future Supabase Storage path if full raw file is stored in Storage.
  storage_path text,

  total_rows integer not null default 0
    check (total_rows >= 0),

  detected_columns text[] not null default array[]::text[],
  response_columns text[] not null default array[]::text[],

  -- Small sample preview for UI.
  raw_preview jsonb not null default '[]'::jsonb,

  -- Later: response6 -> question_id, response7 -> question_id, etc.
  mapping_config jsonb not null default '{}'::jsonb,

  status public.upload_status not null default 'uploaded',

  error_message text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------
-- exam_students
-- Stores one normalized student record per uploaded source row.
-- ---------------------------------------------------------
create table if not exists public.exam_students (
  id uuid primary key default gen_random_uuid(),

  exam_id uuid not null references public.exams(id) on delete cascade,
  upload_id uuid not null references public.answer_uploads(id) on delete cascade,

  -- Optional link to authenticated student profile.
  -- In MVP, students may be imported before they have app accounts.
  profile_id uuid references public.profiles(id) on delete set null,

  first_name text,
  last_name text,
  id_number text,
  email text not null,

  -- 0-based row index from parsed file.
  source_row_index integer not null
    check (source_row_index >= 0),

  -- Complete original row preserved for audit/debug.
  raw_row jsonb not null default '{}'::jsonb,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  unique (exam_id, upload_id, source_row_index)
);

-- ---------------------------------------------------------
-- student_answers
-- Stores normalized question-wise answer text.
-- ---------------------------------------------------------
create table if not exists public.student_answers (
  id uuid primary key default gen_random_uuid(),

  exam_id uuid not null references public.exams(id) on delete cascade,
  exam_student_id uuid not null references public.exam_students(id) on delete cascade,
  question_id uuid not null references public.questions(id) on delete cascade,

  response_column text not null,

  answer_text text not null default '',

  -- Original cell/value as JSON for audit/debug.
  raw_answer jsonb not null default 'null'::jsonb,

  word_count integer not null default 0
    check (word_count >= 0),

  character_count integer not null default 0
    check (character_count >= 0),

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  unique (exam_student_id, question_id),
  unique (exam_student_id, response_column)
);

-- ---------------------------------------------------------
-- Indexes
-- ---------------------------------------------------------

create index if not exists answer_uploads_exam_id_idx
on public.answer_uploads(exam_id);

create index if not exists answer_uploads_uploaded_by_idx
on public.answer_uploads(uploaded_by);

create index if not exists answer_uploads_status_idx
on public.answer_uploads(status);

create index if not exists exam_students_exam_id_idx
on public.exam_students(exam_id);

create index if not exists exam_students_upload_id_idx
on public.exam_students(upload_id);

create index if not exists exam_students_profile_id_idx
on public.exam_students(profile_id);

create index if not exists exam_students_email_idx
on public.exam_students(email);

create index if not exists exam_students_id_number_idx
on public.exam_students(id_number);

create index if not exists student_answers_exam_id_idx
on public.student_answers(exam_id);

create index if not exists student_answers_exam_student_id_idx
on public.student_answers(exam_student_id);

create index if not exists student_answers_question_id_idx
on public.student_answers(question_id);

create index if not exists student_answers_response_column_idx
on public.student_answers(response_column);

-- ---------------------------------------------------------
-- updated_at triggers
-- Uses public.set_updated_at() created earlier.
-- ---------------------------------------------------------

drop trigger if exists set_answer_uploads_updated_at
on public.answer_uploads;

create trigger set_answer_uploads_updated_at
before update on public.answer_uploads
for each row
execute function public.set_updated_at();

drop trigger if exists set_exam_students_updated_at
on public.exam_students;

create trigger set_exam_students_updated_at
before update on public.exam_students
for each row
execute function public.set_updated_at();

drop trigger if exists set_student_answers_updated_at
on public.student_answers;

create trigger set_student_answers_updated_at
before update on public.student_answers
for each row
execute function public.set_updated_at();

-- ---------------------------------------------------------
-- Enable RLS
-- Policies will be added in the next migration.
-- ---------------------------------------------------------

alter table public.answer_uploads enable row level security;
alter table public.exam_students enable row level security;
alter table public.student_answers enable row level security;

-- ---------------------------------------------------------
-- Grants
-- RLS will decide actual row access.
-- ---------------------------------------------------------

grant select, insert, update, delete on public.answer_uploads to authenticated;
grant select, insert, update, delete on public.exam_students to authenticated;
grant select, insert, update, delete on public.student_answers to authenticated;