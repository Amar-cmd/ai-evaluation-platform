-- =========================================================
-- 05_exam_question_rubric_core
-- Core exam, question, and rubric tables
-- =========================================================

-- ---------------------------------------------------------
-- Exams
-- One evaluation session/test created by a professor.
-- ---------------------------------------------------------
create table if not exists public.exams (
  id uuid primary key default gen_random_uuid(),

  professor_id uuid not null references public.profiles(id) on delete restrict,

  title text not null,
  subject text,
  course text,
  batch text,

  total_marks numeric(8, 2) not null default 0
    check (total_marks >= 0),

  status public.exam_status not null default 'draft',

  published_at timestamptz,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------
-- Questions
-- Questions belong to an exam.
-- ---------------------------------------------------------
create table if not exists public.questions (
  id uuid primary key default gen_random_uuid(),

  exam_id uuid not null references public.exams(id) on delete cascade,

  question_no text not null,
  question_order integer not null default 1
    check (question_order > 0),

  question_text text not null,

  question_type public.question_type not null default 'other',

  max_marks numeric(8, 2) not null
    check (max_marks >= 0),

  model_answer text,

  model_answer_status public.model_answer_status not null default 'not_provided',

  ai_generated_model_answer text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  unique (exam_id, question_no),
  unique (exam_id, question_order)
);

-- ---------------------------------------------------------
-- Rubrics
-- Rubric criteria belong to a question.
-- ---------------------------------------------------------
create table if not exists public.rubrics (
  id uuid primary key default gen_random_uuid(),

  question_id uuid not null references public.questions(id) on delete cascade,

  criterion_order integer not null default 1
    check (criterion_order > 0),

  criterion_name text not null,
  criterion_description text,

  max_marks numeric(8, 2) not null
    check (max_marks >= 0),

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  unique (question_id, criterion_order)
);

-- ---------------------------------------------------------
-- Indexes
-- ---------------------------------------------------------
create index if not exists exams_professor_id_idx
on public.exams(professor_id);

create index if not exists exams_status_idx
on public.exams(status);

create index if not exists exams_published_at_idx
on public.exams(published_at);

create index if not exists questions_exam_id_idx
on public.questions(exam_id);

create index if not exists questions_exam_order_idx
on public.questions(exam_id, question_order);

create index if not exists rubrics_question_id_idx
on public.rubrics(question_id);

create index if not exists rubrics_question_order_idx
on public.rubrics(question_id, criterion_order);

-- ---------------------------------------------------------
-- updated_at triggers
-- Uses public.set_updated_at() created earlier.
-- ---------------------------------------------------------
drop trigger if exists set_exams_updated_at on public.exams;

create trigger set_exams_updated_at
before update on public.exams
for each row
execute function public.set_updated_at();

drop trigger if exists set_questions_updated_at on public.questions;

create trigger set_questions_updated_at
before update on public.questions
for each row
execute function public.set_updated_at();

drop trigger if exists set_rubrics_updated_at on public.rubrics;

create trigger set_rubrics_updated_at
before update on public.rubrics
for each row
execute function public.set_updated_at();

-- ---------------------------------------------------------
-- Enable RLS
-- Policies will be added in a later migration.
-- ---------------------------------------------------------
alter table public.exams enable row level security;
alter table public.questions enable row level security;
alter table public.rubrics enable row level security;

-- ---------------------------------------------------------
-- Grants
-- RLS will decide which rows authenticated users can access.
-- ---------------------------------------------------------
grant select, insert, update, delete on public.exams to authenticated;
grant select, insert, update, delete on public.questions to authenticated;
grant select, insert, update, delete on public.rubrics to authenticated;