-- =========================================================
-- 17_master_question_bank_foundation
-- Adds exam mode and master-question-bank fields.
-- This is additive and should not break existing subjective flow.
-- =========================================================

-- ---------------------------------------------------------
-- Exam mode enum
-- ---------------------------------------------------------

do $$
begin
  if not exists (
    select 1
    from pg_type
    where typname = 'exam_mode'
  ) then
    create type public.exam_mode as enum (
      'fixed_paper',
      'randomized_question_bank'
    );
  end if;
end
$$;

-- ---------------------------------------------------------
-- Add objective to question_type enum for future objective questions
-- ---------------------------------------------------------

alter type public.question_type
add value if not exists 'objective';

-- ---------------------------------------------------------
-- exams: add exam_mode
-- ---------------------------------------------------------

alter table public.exams
add column if not exists exam_mode public.exam_mode
not null default 'fixed_paper';

create index if not exists exams_exam_mode_idx
on public.exams(exam_mode);

-- ---------------------------------------------------------
-- questions: add master question bank fields
-- ---------------------------------------------------------

alter table public.questions
add column if not exists question_code text;

alter table public.questions
add column if not exists is_ai_evaluable boolean
not null default true;

alter table public.questions
add column if not exists question_category text;

alter table public.questions
add column if not exists expected_answer_format text;

-- Existing questions should get a usable question_code from question_no.
update public.questions
set question_code = question_no
where question_code is null
  and question_no is not null;

-- One question code should identify one master-bank item within an exam.
-- Partial unique index allows nulls if professor has not set code yet.
create unique index if not exists questions_exam_question_code_unique_idx
on public.questions(exam_id, question_code)
where question_code is not null;

create index if not exists questions_is_ai_evaluable_idx
on public.questions(is_ai_evaluable);

create index if not exists questions_question_category_idx
on public.questions(question_category);

-- ---------------------------------------------------------
-- Documentation comments
-- ---------------------------------------------------------

comment on column public.exams.exam_mode is
'Exam mode: fixed_paper uses response-column mapping; randomized_question_bank requires per-answer-cell mapping.';

comment on column public.questions.question_code is
'Stable master question bank code, useful for export/import and mapping. Example: IR-Q001, CASE-05.';

comment on column public.questions.is_ai_evaluable is
'Whether this question should enter subjective AI evaluation. Objective questions usually default to false.';

comment on column public.questions.question_category is
'Flexible category label such as concept, case_based, essay, objective, short_answer, long_answer.';

comment on column public.questions.expected_answer_format is
'Optional guidance about expected answer format, e.g. one_line, paragraph, case_analysis, essay.';