-- =========================================================
-- 11_evaluation_schema
-- AI evaluation jobs, evaluations, and rubric breakdowns
-- =========================================================

-- ---------------------------------------------------------
-- AI evaluation job status enum
-- ---------------------------------------------------------
do $$
begin
  if not exists (select 1 from pg_type where typname = 'evaluation_job_status') then
    create type public.evaluation_job_status as enum (
      'queued',
      'running',
      'completed',
      'completed_with_errors',
      'failed',
      'cancelled'
    );
  end if;
end
$$;

-- ---------------------------------------------------------
-- evaluation_jobs
-- Tracks one AI batch evaluation run for an exam.
-- ---------------------------------------------------------
create table if not exists public.evaluation_jobs (
  id uuid primary key default gen_random_uuid(),

  exam_id uuid not null references public.exams(id) on delete cascade,
  created_by uuid not null references public.profiles(id) on delete restrict,

  status public.evaluation_job_status not null default 'queued',

  total_items integer not null default 0
    check (total_items >= 0),

  completed_items integer not null default 0
    check (completed_items >= 0),

  failed_items integer not null default 0
    check (failed_items >= 0),

  started_at timestamptz,
  completed_at timestamptz,

  error_message text,

  job_metadata jsonb not null default '{}'::jsonb,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  check (completed_items <= total_items),
  check (failed_items <= total_items),
  check ((completed_items + failed_items) <= total_items)
);

-- ---------------------------------------------------------
-- evaluations
-- Stores AI score, professor score, final score, feedback,
-- quality labels, confidence, and raw AI output.
-- ---------------------------------------------------------
create table if not exists public.evaluations (
  id uuid primary key default gen_random_uuid(),

  exam_id uuid not null references public.exams(id) on delete cascade,
  student_answer_id uuid not null references public.student_answers(id) on delete cascade,
  ai_job_id uuid references public.evaluation_jobs(id) on delete set null,

  ai_score numeric(8, 2)
    check (ai_score is null or ai_score >= 0),

  professor_score numeric(8, 2)
    check (professor_score is null or professor_score >= 0),

  final_score numeric(8, 2)
    check (final_score is null or final_score >= 0),

  max_marks numeric(8, 2) not null
    check (max_marks >= 0),

  quality_label public.quality_label,
  ai_confidence public.ai_confidence,

  ai_feedback text,
  professor_feedback text,

  teacher_review_summary text,
  student_facing_justification text,

  what_student_did_well jsonb not null default '[]'::jsonb,
  what_is_missing jsonb not null default '[]'::jsonb,

  ai_raw_output jsonb,

  status public.evaluation_status not null default 'pending',

  reviewed_by uuid references public.profiles(id) on delete set null,
  reviewed_at timestamptz,

  approved_by uuid references public.profiles(id) on delete set null,
  approved_at timestamptz,

  published_at timestamptz,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  unique (student_answer_id),

  check (ai_score is null or ai_score <= max_marks),
  check (professor_score is null or professor_score <= max_marks),
  check (final_score is null or final_score <= max_marks)
);

-- ---------------------------------------------------------
-- evaluation_rubric_breakdowns
-- Stores criterion-wise AI/professor/final awarded marks.
-- ---------------------------------------------------------
create table if not exists public.evaluation_rubric_breakdowns (
  id uuid primary key default gen_random_uuid(),

  evaluation_id uuid not null references public.evaluations(id) on delete cascade,
  rubric_id uuid references public.rubrics(id) on delete set null,

  criterion_name text not null,
  criterion_description text,

  max_marks numeric(8, 2) not null
    check (max_marks >= 0),

  ai_awarded_marks numeric(8, 2)
    check (ai_awarded_marks is null or ai_awarded_marks >= 0),

  professor_awarded_marks numeric(8, 2)
    check (professor_awarded_marks is null or professor_awarded_marks >= 0),

  final_awarded_marks numeric(8, 2)
    check (final_awarded_marks is null or final_awarded_marks >= 0),

  ai_reason text,
  professor_reason text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  unique (evaluation_id, rubric_id),

  check (ai_awarded_marks is null or ai_awarded_marks <= max_marks),
  check (professor_awarded_marks is null or professor_awarded_marks <= max_marks),
  check (final_awarded_marks is null or final_awarded_marks <= max_marks)
);

-- ---------------------------------------------------------
-- Indexes
-- ---------------------------------------------------------

create index if not exists evaluation_jobs_exam_id_idx
on public.evaluation_jobs(exam_id);

create index if not exists evaluation_jobs_created_by_idx
on public.evaluation_jobs(created_by);

create index if not exists evaluation_jobs_status_idx
on public.evaluation_jobs(status);

create index if not exists evaluations_exam_id_idx
on public.evaluations(exam_id);

create index if not exists evaluations_student_answer_id_idx
on public.evaluations(student_answer_id);

create index if not exists evaluations_ai_job_id_idx
on public.evaluations(ai_job_id);

create index if not exists evaluations_status_idx
on public.evaluations(status);

create index if not exists evaluations_quality_label_idx
on public.evaluations(quality_label);

create index if not exists evaluations_ai_confidence_idx
on public.evaluations(ai_confidence);

create index if not exists evaluations_reviewed_by_idx
on public.evaluations(reviewed_by);

create index if not exists evaluations_approved_by_idx
on public.evaluations(approved_by);

create index if not exists evaluation_rubric_breakdowns_evaluation_id_idx
on public.evaluation_rubric_breakdowns(evaluation_id);

create index if not exists evaluation_rubric_breakdowns_rubric_id_idx
on public.evaluation_rubric_breakdowns(rubric_id);

-- ---------------------------------------------------------
-- updated_at triggers
-- ---------------------------------------------------------

drop trigger if exists set_evaluation_jobs_updated_at
on public.evaluation_jobs;

create trigger set_evaluation_jobs_updated_at
before update on public.evaluation_jobs
for each row
execute function public.set_updated_at();

drop trigger if exists set_evaluations_updated_at
on public.evaluations;

create trigger set_evaluations_updated_at
before update on public.evaluations
for each row
execute function public.set_updated_at();

drop trigger if exists set_evaluation_rubric_breakdowns_updated_at
on public.evaluation_rubric_breakdowns;

create trigger set_evaluation_rubric_breakdowns_updated_at
before update on public.evaluation_rubric_breakdowns
for each row
execute function public.set_updated_at();

-- ---------------------------------------------------------
-- Enable RLS
-- Policies will be added in the next migration.
-- ---------------------------------------------------------

alter table public.evaluation_jobs enable row level security;
alter table public.evaluations enable row level security;
alter table public.evaluation_rubric_breakdowns enable row level security;

-- ---------------------------------------------------------
-- Grants
-- RLS will decide actual row access.
-- ---------------------------------------------------------

grant select, insert, update, delete on public.evaluation_jobs to authenticated;
grant select, insert, update, delete on public.evaluations to authenticated;
grant select, insert, update, delete on public.evaluation_rubric_breakdowns to authenticated;