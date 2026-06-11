-- =========================================================
-- 18_rubric_template_schema
-- Creates exam-level/category-level rubric templates.
-- These templates reduce repeated rubric creation for professors.
-- Existing question-level rubrics table remains the final source
-- used by the AI evaluation pipeline after materialization.
-- =========================================================

-- ---------------------------------------------------------
-- Rubric templates
-- ---------------------------------------------------------

create table if not exists public.rubric_templates (
  id uuid primary key default gen_random_uuid(),

  exam_id uuid not null references public.exams(id) on delete cascade,
  professor_id uuid not null references public.profiles(id) on delete restrict,

  template_name text not null,

  -- Flexible matching hints.
  -- Example values:
  -- applies_to_question_type: case_based, long_answer, essay, short_answer
  -- question_category: case_based, analytical, conceptual, essay
  applies_to_question_type text,
  question_category text,

  total_marks numeric(8, 2) not null check (total_marks >= 0),

  description text,

  is_active boolean not null default true,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  unique (exam_id, template_name)
);

create index if not exists rubric_templates_exam_id_idx
on public.rubric_templates(exam_id);

create index if not exists rubric_templates_professor_id_idx
on public.rubric_templates(professor_id);

create index if not exists rubric_templates_applies_to_question_type_idx
on public.rubric_templates(applies_to_question_type);

create index if not exists rubric_templates_question_category_idx
on public.rubric_templates(question_category);

create index if not exists rubric_templates_is_active_idx
on public.rubric_templates(is_active);

drop trigger if exists set_rubric_templates_updated_at
on public.rubric_templates;

create trigger set_rubric_templates_updated_at
before update on public.rubric_templates
for each row
execute function public.set_updated_at();

-- ---------------------------------------------------------
-- Rubric template criteria
-- ---------------------------------------------------------

create table if not exists public.rubric_template_criteria (
  id uuid primary key default gen_random_uuid(),

  rubric_template_id uuid not null
    references public.rubric_templates(id)
    on delete cascade,

  criterion_order integer not null default 1 check (criterion_order > 0),

  criterion_name text not null,
  criterion_description text,

  max_marks numeric(8, 2) not null check (max_marks >= 0),

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  unique (rubric_template_id, criterion_order)
);

create index if not exists rubric_template_criteria_template_id_idx
on public.rubric_template_criteria(rubric_template_id);

drop trigger if exists set_rubric_template_criteria_updated_at
on public.rubric_template_criteria;

create trigger set_rubric_template_criteria_updated_at
before update on public.rubric_template_criteria
for each row
execute function public.set_updated_at();

-- ---------------------------------------------------------
-- Enable RLS
-- ---------------------------------------------------------

alter table public.rubric_templates enable row level security;
alter table public.rubric_template_criteria enable row level security;

grant select, insert, update, delete
on public.rubric_templates
to authenticated;

grant select, insert, update, delete
on public.rubric_template_criteria
to authenticated;

-- ---------------------------------------------------------
-- Clean old policies for safe dev re-runs
-- ---------------------------------------------------------

drop policy if exists "Admins can access all rubric templates"
on public.rubric_templates;

drop policy if exists "Professors can read own exam rubric templates"
on public.rubric_templates;

drop policy if exists "Professors can create own exam rubric templates"
on public.rubric_templates;

drop policy if exists "Professors can update own exam rubric templates"
on public.rubric_templates;

drop policy if exists "Professors can delete own exam rubric templates"
on public.rubric_templates;

drop policy if exists "Admins can access all rubric template criteria"
on public.rubric_template_criteria;

drop policy if exists "Professors can read own rubric template criteria"
on public.rubric_template_criteria;

drop policy if exists "Professors can create own rubric template criteria"
on public.rubric_template_criteria;

drop policy if exists "Professors can update own rubric template criteria"
on public.rubric_template_criteria;

drop policy if exists "Professors can delete own rubric template criteria"
on public.rubric_template_criteria;

-- =========================================================
-- RLS: rubric_templates
-- =========================================================

create policy "Admins can access all rubric templates"
on public.rubric_templates
for all
to authenticated
using (
  public.is_admin()
)
with check (
  public.is_admin()
);

create policy "Professors can read own exam rubric templates"
on public.rubric_templates
for select
to authenticated
using (
  public.is_professor()
  and exists (
    select 1
    from public.exams e
    where e.id = rubric_templates.exam_id
      and e.professor_id = auth.uid()
  )
);

create policy "Professors can create own exam rubric templates"
on public.rubric_templates
for insert
to authenticated
with check (
  public.is_professor()
  and professor_id = auth.uid()
  and exists (
    select 1
    from public.exams e
    where e.id = rubric_templates.exam_id
      and e.professor_id = auth.uid()
  )
);

create policy "Professors can update own exam rubric templates"
on public.rubric_templates
for update
to authenticated
using (
  public.is_professor()
  and professor_id = auth.uid()
  and exists (
    select 1
    from public.exams e
    where e.id = rubric_templates.exam_id
      and e.professor_id = auth.uid()
  )
)
with check (
  public.is_professor()
  and professor_id = auth.uid()
  and exists (
    select 1
    from public.exams e
    where e.id = rubric_templates.exam_id
      and e.professor_id = auth.uid()
  )
);

create policy "Professors can delete own exam rubric templates"
on public.rubric_templates
for delete
to authenticated
using (
  public.is_professor()
  and professor_id = auth.uid()
  and exists (
    select 1
    from public.exams e
    where e.id = rubric_templates.exam_id
      and e.professor_id = auth.uid()
  )
);

-- =========================================================
-- RLS: rubric_template_criteria
-- =========================================================

create policy "Admins can access all rubric template criteria"
on public.rubric_template_criteria
for all
to authenticated
using (
  public.is_admin()
)
with check (
  public.is_admin()
);

create policy "Professors can read own rubric template criteria"
on public.rubric_template_criteria
for select
to authenticated
using (
  public.is_professor()
  and exists (
    select 1
    from public.rubric_templates rt
    join public.exams e
      on e.id = rt.exam_id
    where rt.id = rubric_template_criteria.rubric_template_id
      and e.professor_id = auth.uid()
      and rt.professor_id = auth.uid()
  )
);

create policy "Professors can create own rubric template criteria"
on public.rubric_template_criteria
for insert
to authenticated
with check (
  public.is_professor()
  and exists (
    select 1
    from public.rubric_templates rt
    join public.exams e
      on e.id = rt.exam_id
    where rt.id = rubric_template_criteria.rubric_template_id
      and e.professor_id = auth.uid()
      and rt.professor_id = auth.uid()
  )
);

create policy "Professors can update own rubric template criteria"
on public.rubric_template_criteria
for update
to authenticated
using (
  public.is_professor()
  and exists (
    select 1
    from public.rubric_templates rt
    join public.exams e
      on e.id = rt.exam_id
    where rt.id = rubric_template_criteria.rubric_template_id
      and e.professor_id = auth.uid()
      and rt.professor_id = auth.uid()
  )
)
with check (
  public.is_professor()
  and exists (
    select 1
    from public.rubric_templates rt
    join public.exams e
      on e.id = rt.exam_id
    where rt.id = rubric_template_criteria.rubric_template_id
      and e.professor_id = auth.uid()
      and rt.professor_id = auth.uid()
  )
);

create policy "Professors can delete own rubric template criteria"
on public.rubric_template_criteria
for delete
to authenticated
using (
  public.is_professor()
  and exists (
    select 1
    from public.rubric_templates rt
    join public.exams e
      on e.id = rt.exam_id
    where rt.id = rubric_template_criteria.rubric_template_id
      and e.professor_id = auth.uid()
      and rt.professor_id = auth.uid()
  )
);

-- ---------------------------------------------------------
-- Comments
-- ---------------------------------------------------------

comment on table public.rubric_templates is
'Reusable exam-level rubric templates. These reduce repeated rubric creation for similar subjective question categories.';

comment on table public.rubric_template_criteria is
'Criteria rows belonging to a rubric template. These later materialize into question-level rubrics.';

comment on column public.rubric_templates.applies_to_question_type is
'Optional question type hint such as short_answer, long_answer, case_based, essay.';

comment on column public.rubric_templates.question_category is
'Optional flexible category label for grouping questions beyond the built-in question type.';