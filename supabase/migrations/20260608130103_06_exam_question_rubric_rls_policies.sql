-- =========================================================
-- 06_exam_question_rubric_rls_policies
-- RLS policies for exams, questions, and rubrics
-- =========================================================

-- ---------------------------------------------------------
-- Ensure RLS is enabled
-- ---------------------------------------------------------
alter table public.exams enable row level security;
alter table public.questions enable row level security;
alter table public.rubrics enable row level security;

-- ---------------------------------------------------------
-- Drop existing policies for clean development re-runs
-- ---------------------------------------------------------

-- exams
drop policy if exists "Admins can access all exams"
on public.exams;

drop policy if exists "Professors can read own exams"
on public.exams;

drop policy if exists "Professors can create own exams"
on public.exams;

drop policy if exists "Professors can update own exams"
on public.exams;

drop policy if exists "Professors can delete own draft exams"
on public.exams;

-- questions
drop policy if exists "Admins can access all questions"
on public.questions;

drop policy if exists "Professors can read questions of own exams"
on public.questions;

drop policy if exists "Professors can create questions for own exams"
on public.questions;

drop policy if exists "Professors can update questions of own exams"
on public.questions;

drop policy if exists "Professors can delete questions of own exams"
on public.questions;

-- rubrics
drop policy if exists "Admins can access all rubrics"
on public.rubrics;

drop policy if exists "Professors can read rubrics of own exams"
on public.rubrics;

drop policy if exists "Professors can create rubrics for own questions"
on public.rubrics;

drop policy if exists "Professors can update rubrics of own questions"
on public.rubrics;

drop policy if exists "Professors can delete rubrics of own questions"
on public.rubrics;

-- =========================================================
-- EXAMS POLICIES
-- =========================================================

-- ---------------------------------------------------------
-- Admin can do everything on exams
-- ---------------------------------------------------------
create policy "Admins can access all exams"
on public.exams
for all
to authenticated
using (
  public.is_admin()
)
with check (
  public.is_admin()
);

-- ---------------------------------------------------------
-- Professor can read own exams
-- ---------------------------------------------------------
create policy "Professors can read own exams"
on public.exams
for select
to authenticated
using (
  public.is_professor()
  and professor_id = auth.uid()
);

-- ---------------------------------------------------------
-- Professor can create exam only for self
-- ---------------------------------------------------------
create policy "Professors can create own exams"
on public.exams
for insert
to authenticated
with check (
  public.is_professor()
  and professor_id = auth.uid()
);

-- ---------------------------------------------------------
-- Professor can update own non-archived exams
-- Ownership cannot be changed by professor.
-- ---------------------------------------------------------
create policy "Professors can update own exams"
on public.exams
for update
to authenticated
using (
  public.is_professor()
  and professor_id = auth.uid()
  and status <> 'archived'
)
with check (
  public.is_professor()
  and professor_id = auth.uid()
  and status <> 'archived'
);

-- ---------------------------------------------------------
-- Professor can delete only own draft exams
-- ---------------------------------------------------------
create policy "Professors can delete own draft exams"
on public.exams
for delete
to authenticated
using (
  public.is_professor()
  and professor_id = auth.uid()
  and status = 'draft'
);

-- =========================================================
-- QUESTIONS POLICIES
-- =========================================================

-- ---------------------------------------------------------
-- Admin can do everything on questions
-- ---------------------------------------------------------
create policy "Admins can access all questions"
on public.questions
for all
to authenticated
using (
  public.is_admin()
)
with check (
  public.is_admin()
);

-- ---------------------------------------------------------
-- Professor can read questions of own exams
-- ---------------------------------------------------------
create policy "Professors can read questions of own exams"
on public.questions
for select
to authenticated
using (
  public.is_professor()
  and exists (
    select 1
    from public.exams e
    where e.id = questions.exam_id
      and e.professor_id = auth.uid()
  )
);

-- ---------------------------------------------------------
-- Professor can create questions only inside own exams
-- ---------------------------------------------------------
create policy "Professors can create questions for own exams"
on public.questions
for insert
to authenticated
with check (
  public.is_professor()
  and exists (
    select 1
    from public.exams e
    where e.id = questions.exam_id
      and e.professor_id = auth.uid()
  )
);

-- ---------------------------------------------------------
-- Professor can update questions of own exams
-- ---------------------------------------------------------
create policy "Professors can update questions of own exams"
on public.questions
for update
to authenticated
using (
  public.is_professor()
  and exists (
    select 1
    from public.exams e
    where e.id = questions.exam_id
      and e.professor_id = auth.uid()
  )
)
with check (
  public.is_professor()
  and exists (
    select 1
    from public.exams e
    where e.id = questions.exam_id
      and e.professor_id = auth.uid()
  )
);

-- ---------------------------------------------------------
-- Professor can delete questions of own exams
-- ---------------------------------------------------------
create policy "Professors can delete questions of own exams"
on public.questions
for delete
to authenticated
using (
  public.is_professor()
  and exists (
    select 1
    from public.exams e
    where e.id = questions.exam_id
      and e.professor_id = auth.uid()
  )
);

-- =========================================================
-- RUBRICS POLICIES
-- =========================================================

-- ---------------------------------------------------------
-- Admin can do everything on rubrics
-- ---------------------------------------------------------
create policy "Admins can access all rubrics"
on public.rubrics
for all
to authenticated
using (
  public.is_admin()
)
with check (
  public.is_admin()
);

-- ---------------------------------------------------------
-- Professor can read rubrics of questions from own exams
-- ---------------------------------------------------------
create policy "Professors can read rubrics of own exams"
on public.rubrics
for select
to authenticated
using (
  public.is_professor()
  and exists (
    select 1
    from public.questions q
    join public.exams e on e.id = q.exam_id
    where q.id = rubrics.question_id
      and e.professor_id = auth.uid()
  )
);

-- ---------------------------------------------------------
-- Professor can create rubrics for questions from own exams
-- ---------------------------------------------------------
create policy "Professors can create rubrics for own questions"
on public.rubrics
for insert
to authenticated
with check (
  public.is_professor()
  and exists (
    select 1
    from public.questions q
    join public.exams e on e.id = q.exam_id
    where q.id = rubrics.question_id
      and e.professor_id = auth.uid()
  )
);

-- ---------------------------------------------------------
-- Professor can update rubrics of questions from own exams
-- ---------------------------------------------------------
create policy "Professors can update rubrics of own questions"
on public.rubrics
for update
to authenticated
using (
  public.is_professor()
  and exists (
    select 1
    from public.questions q
    join public.exams e on e.id = q.exam_id
    where q.id = rubrics.question_id
      and e.professor_id = auth.uid()
  )
)
with check (
  public.is_professor()
  and exists (
    select 1
    from public.questions q
    join public.exams e on e.id = q.exam_id
    where q.id = rubrics.question_id
      and e.professor_id = auth.uid()
  )
);

-- ---------------------------------------------------------
-- Professor can delete rubrics of questions from own exams
-- ---------------------------------------------------------
create policy "Professors can delete rubrics of own questions"
on public.rubrics
for delete
to authenticated
using (
  public.is_professor()
  and exists (
    select 1
    from public.questions q
    join public.exams e on e.id = q.exam_id
    where q.id = rubrics.question_id
      and e.professor_id = auth.uid()
  )
);