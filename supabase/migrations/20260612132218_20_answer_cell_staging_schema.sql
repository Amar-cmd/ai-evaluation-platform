-- =========================================================
-- 20_answer_cell_staging_schema
-- Creates answer-cell staging table for smart mapping.
--
-- Purpose:
-- For randomized/question-bank style exams, response columns are not always
-- globally mappable to questions. Each non-empty response cell should be staged,
-- mapped with AI/heuristics, reviewed by professor, and then materialized into
-- student_answers.
-- =========================================================

create table if not exists public.student_answer_cells (
  id uuid primary key default gen_random_uuid(),

  exam_id uuid not null references public.exams(id) on delete cascade,
  upload_id uuid not null references public.answer_uploads(id) on delete cascade,

  -- Optional link to the raw staged upload row.
  -- Kept nullable for compatibility in case some older staging rows do not have ids
  -- or future import sources generate cells differently.
  upload_row_id uuid references public.answer_upload_rows(id) on delete cascade,

  source_row_index integer not null check (source_row_index >= 0),

  -- Example: response1, response2, response6
  response_column text not null,

  -- Student record may be created before or after cell staging.
  -- So this is nullable initially and can be linked later.
  exam_student_id uuid references public.exam_students(id) on delete set null,

  answer_text text not null,
  raw_answer jsonb,

  word_count integer not null default 0 check (word_count >= 0),
  character_count integer not null default 0 check (character_count >= 0),

  -- Mapping suggestion from heuristic / LLM.
  suggested_question_id uuid references public.questions(id) on delete set null,

  -- Final professor-confirmed question.
  final_question_id uuid references public.questions(id) on delete set null,

  -- unmapped: newly created cell
  -- suggested: system has suggested question
  -- confirmed: professor/system has confirmed mapping
  -- ignored: cell should not become student_answer, e.g. blank/objective/irrelevant
  -- imported: already materialized into student_answers
  -- conflict: multiple possible questions / needs review
  -- failed: mapping attempt failed
  mapping_status text not null default 'unmapped'
    check (
      mapping_status in (
        'unmapped',
        'suggested',
        'confirmed',
        'ignored',
        'imported',
        'conflict',
        'failed'
      )
    ),

  -- deterministic: question id/code/text found in upload data
  -- heuristic: non-LLM rule based suggestion
  -- llm: AI mapping suggestion
  -- professor: professor manually selected
  mapping_source text
    check (
      mapping_source is null
      or mapping_source in (
        'deterministic',
        'heuristic',
        'llm',
        'professor'
      )
    ),

  mapping_confidence text
    check (
      mapping_confidence is null
      or mapping_confidence in (
        'high',
        'medium',
        'low',
        'unknown'
      )
    ),

  -- Optional numeric score for future sorting/filtering.
  mapping_confidence_score numeric(5, 4)
    check (
      mapping_confidence_score is null
      or (
        mapping_confidence_score >= 0
        and mapping_confidence_score <= 1
      )
    ),

  mapping_reason text,
  ignore_reason text,

  confirmed_by uuid references public.profiles(id) on delete set null,
  confirmed_at timestamptz,

  imported_student_answer_id uuid references public.student_answers(id) on delete set null,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  -- One cell per upload row + response column.
  unique (upload_id, source_row_index, response_column),

  -- If confirmed/imported, final question should exist.
  check (
    mapping_status not in ('confirmed', 'imported')
    or final_question_id is not null
  ),

  -- If ignored, ignore reason should ideally exist.
  check (
    mapping_status <> 'ignored'
    or length(trim(coalesce(ignore_reason, ''))) > 0
  )
);

-- ---------------------------------------------------------
-- Indexes
-- ---------------------------------------------------------

create index if not exists student_answer_cells_exam_id_idx
on public.student_answer_cells(exam_id);

create index if not exists student_answer_cells_upload_id_idx
on public.student_answer_cells(upload_id);

create index if not exists student_answer_cells_upload_row_id_idx
on public.student_answer_cells(upload_row_id);

create index if not exists student_answer_cells_exam_student_id_idx
on public.student_answer_cells(exam_student_id);

create index if not exists student_answer_cells_response_column_idx
on public.student_answer_cells(response_column);

create index if not exists student_answer_cells_suggested_question_id_idx
on public.student_answer_cells(suggested_question_id);

create index if not exists student_answer_cells_final_question_id_idx
on public.student_answer_cells(final_question_id);

create index if not exists student_answer_cells_mapping_status_idx
on public.student_answer_cells(mapping_status);

create index if not exists student_answer_cells_mapping_confidence_idx
on public.student_answer_cells(mapping_confidence);

create index if not exists student_answer_cells_imported_student_answer_id_idx
on public.student_answer_cells(imported_student_answer_id);

-- Helpful for review screens.
create index if not exists student_answer_cells_review_idx
on public.student_answer_cells(exam_id, mapping_status, mapping_confidence);

-- ---------------------------------------------------------
-- updated_at trigger
-- ---------------------------------------------------------

drop trigger if exists set_student_answer_cells_updated_at
on public.student_answer_cells;

create trigger set_student_answer_cells_updated_at
before update on public.student_answer_cells
for each row
execute function public.set_updated_at();

-- ---------------------------------------------------------
-- Enable RLS
-- ---------------------------------------------------------

alter table public.student_answer_cells enable row level security;

grant select, insert, update, delete
on public.student_answer_cells
to authenticated;

-- ---------------------------------------------------------
-- Drop old policies for safe dev re-runs
-- ---------------------------------------------------------

drop policy if exists "Admins can access all answer cells"
on public.student_answer_cells;

drop policy if exists "Professors can read own exam answer cells"
on public.student_answer_cells;

drop policy if exists "Professors can create own exam answer cells"
on public.student_answer_cells;

drop policy if exists "Professors can update own exam answer cells"
on public.student_answer_cells;

drop policy if exists "Professors can delete own exam answer cells"
on public.student_answer_cells;

-- =========================================================
-- RLS: Admin
-- =========================================================

create policy "Admins can access all answer cells"
on public.student_answer_cells
for all
to authenticated
using (
  public.is_admin()
)
with check (
  public.is_admin()
);

-- =========================================================
-- RLS: Professor access for own exams
-- =========================================================

create policy "Professors can read own exam answer cells"
on public.student_answer_cells
for select
to authenticated
using (
  public.is_professor()
  and exists (
    select 1
    from public.exams e
    where e.id = student_answer_cells.exam_id
      and e.professor_id = auth.uid()
  )
);

create policy "Professors can create own exam answer cells"
on public.student_answer_cells
for insert
to authenticated
with check (
  public.is_professor()
  and exists (
    select 1
    from public.exams e
    where e.id = student_answer_cells.exam_id
      and e.professor_id = auth.uid()
  )
  and exists (
    select 1
    from public.answer_uploads au
    where au.id = student_answer_cells.upload_id
      and au.exam_id = student_answer_cells.exam_id
  )
);

create policy "Professors can update own exam answer cells"
on public.student_answer_cells
for update
to authenticated
using (
  public.is_professor()
  and exists (
    select 1
    from public.exams e
    where e.id = student_answer_cells.exam_id
      and e.professor_id = auth.uid()
  )
)
with check (
  public.is_professor()
  and exists (
    select 1
    from public.exams e
    where e.id = student_answer_cells.exam_id
      and e.professor_id = auth.uid()
  )
  and exists (
    select 1
    from public.answer_uploads au
    where au.id = student_answer_cells.upload_id
      and au.exam_id = student_answer_cells.exam_id
  )
);

create policy "Professors can delete own exam answer cells"
on public.student_answer_cells
for delete
to authenticated
using (
  public.is_professor()
  and mapping_status <> 'imported'
  and exists (
    select 1
    from public.exams e
    where e.id = student_answer_cells.exam_id
      and e.professor_id = auth.uid()
  )
);

-- ---------------------------------------------------------
-- Comments
-- ---------------------------------------------------------

comment on table public.student_answer_cells is
'Stages individual answer cells from uploaded student response files for smart mapping before creating student_answers rows.';

comment on column public.student_answer_cells.response_column is
'Original response column from uploaded file, e.g. response1, response6.';

comment on column public.student_answer_cells.suggested_question_id is
'Question suggested by deterministic, heuristic, or LLM mapping.';

comment on column public.student_answer_cells.final_question_id is
'Professor-confirmed final question mapping. Required before materializing into student_answers.';

comment on column public.student_answer_cells.mapping_status is
'Current mapping workflow status: unmapped, suggested, confirmed, ignored, imported, conflict, failed.';

comment on column public.student_answer_cells.mapping_confidence is
'Human-friendly confidence bucket for mapping review: high, medium, low, unknown.';

comment on column public.student_answer_cells.imported_student_answer_id is
'Links to student_answers row after confirmed cell is materialized.';