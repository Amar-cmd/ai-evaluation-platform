-- =========================================================
-- 12_evaluation_rls_policies
-- RLS policies for evaluation_jobs, evaluations,
-- and evaluation_rubric_breakdowns
-- =========================================================

-- ---------------------------------------------------------
-- Ensure RLS is enabled
-- ---------------------------------------------------------

alter table public.evaluation_jobs enable row level security;
alter table public.evaluations enable row level security;
alter table public.evaluation_rubric_breakdowns enable row level security;

-- ---------------------------------------------------------
-- Drop existing policies for clean development re-runs
-- ---------------------------------------------------------

-- evaluation_jobs
drop policy if exists "Admins can access all evaluation jobs"
on public.evaluation_jobs;

drop policy if exists "Professors can read jobs for own exams"
on public.evaluation_jobs;

drop policy if exists "Professors can create jobs for own exams"
on public.evaluation_jobs;

drop policy if exists "Professors can update jobs for own exams"
on public.evaluation_jobs;

drop policy if exists "Professors can delete jobs for own exams"
on public.evaluation_jobs;

-- evaluations
drop policy if exists "Admins can access all evaluations"
on public.evaluations;

drop policy if exists "Professors can read evaluations for own exams"
on public.evaluations;

drop policy if exists "Professors can create evaluations for own exams"
on public.evaluations;

drop policy if exists "Professors can update evaluations for own exams"
on public.evaluations;

drop policy if exists "Professors can delete evaluations for own exams"
on public.evaluations;

-- evaluation_rubric_breakdowns
drop policy if exists "Admins can access all evaluation rubric breakdowns"
on public.evaluation_rubric_breakdowns;

drop policy if exists "Professors can read breakdowns for own exams"
on public.evaluation_rubric_breakdowns;

drop policy if exists "Professors can create breakdowns for own exams"
on public.evaluation_rubric_breakdowns;

drop policy if exists "Professors can update breakdowns for own exams"
on public.evaluation_rubric_breakdowns;

drop policy if exists "Professors can delete breakdowns for own exams"
on public.evaluation_rubric_breakdowns;

-- =========================================================
-- EVALUATION_JOBS POLICIES
-- =========================================================

create policy "Admins can access all evaluation jobs"
on public.evaluation_jobs
for all
to authenticated
using (
  public.is_admin()
)
with check (
  public.is_admin()
);

create policy "Professors can read jobs for own exams"
on public.evaluation_jobs
for select
to authenticated
using (
  public.is_professor()
  and exists (
    select 1
    from public.exams e
    where e.id = evaluation_jobs.exam_id
      and e.professor_id = auth.uid()
  )
);

create policy "Professors can create jobs for own exams"
on public.evaluation_jobs
for insert
to authenticated
with check (
  public.is_professor()
  and created_by = auth.uid()
  and exists (
    select 1
    from public.exams e
    where e.id = evaluation_jobs.exam_id
      and e.professor_id = auth.uid()
  )
);

create policy "Professors can update jobs for own exams"
on public.evaluation_jobs
for update
to authenticated
using (
  public.is_professor()
  and exists (
    select 1
    from public.exams e
    where e.id = evaluation_jobs.exam_id
      and e.professor_id = auth.uid()
  )
)
with check (
  public.is_professor()
  and created_by = auth.uid()
  and exists (
    select 1
    from public.exams e
    where e.id = evaluation_jobs.exam_id
      and e.professor_id = auth.uid()
  )
);

create policy "Professors can delete jobs for own exams"
on public.evaluation_jobs
for delete
to authenticated
using (
  public.is_professor()
  and status in ('queued', 'failed', 'cancelled')
  and exists (
    select 1
    from public.exams e
    where e.id = evaluation_jobs.exam_id
      and e.professor_id = auth.uid()
  )
);

-- =========================================================
-- EVALUATIONS POLICIES
-- =========================================================

create policy "Admins can access all evaluations"
on public.evaluations
for all
to authenticated
using (
  public.is_admin()
)
with check (
  public.is_admin()
);

create policy "Professors can read evaluations for own exams"
on public.evaluations
for select
to authenticated
using (
  public.is_professor()
  and exists (
    select 1
    from public.exams e
    where e.id = evaluations.exam_id
      and e.professor_id = auth.uid()
  )
);

create policy "Professors can create evaluations for own exams"
on public.evaluations
for insert
to authenticated
with check (
  public.is_professor()

  -- Evaluation must belong to professor's own exam
  and exists (
    select 1
    from public.exams e
    where e.id = evaluations.exam_id
      and e.professor_id = auth.uid()
  )

  -- Student answer must belong to the same exam
  and exists (
    select 1
    from public.student_answers sa
    where sa.id = evaluations.student_answer_id
      and sa.exam_id = evaluations.exam_id
  )

  -- AI job, if present, must belong to the same exam
  and (
    evaluations.ai_job_id is null
    or exists (
      select 1
      from public.evaluation_jobs ej
      where ej.id = evaluations.ai_job_id
        and ej.exam_id = evaluations.exam_id
    )
  )
);

create policy "Professors can update evaluations for own exams"
on public.evaluations
for update
to authenticated
using (
  public.is_professor()
  and exists (
    select 1
    from public.exams e
    where e.id = evaluations.exam_id
      and e.professor_id = auth.uid()
  )
)
with check (
  public.is_professor()

  and exists (
    select 1
    from public.exams e
    where e.id = evaluations.exam_id
      and e.professor_id = auth.uid()
  )

  and exists (
    select 1
    from public.student_answers sa
    where sa.id = evaluations.student_answer_id
      and sa.exam_id = evaluations.exam_id
  )

  and (
    evaluations.ai_job_id is null
    or exists (
      select 1
      from public.evaluation_jobs ej
      where ej.id = evaluations.ai_job_id
        and ej.exam_id = evaluations.exam_id
    )
  )
);

create policy "Professors can delete evaluations for own exams"
on public.evaluations
for delete
to authenticated
using (
  public.is_professor()
  and status in ('pending', 'ai_checked', 'professor_review_pending')
  and exists (
    select 1
    from public.exams e
    where e.id = evaluations.exam_id
      and e.professor_id = auth.uid()
  )
);

-- =========================================================
-- EVALUATION_RUBRIC_BREAKDOWNS POLICIES
-- =========================================================

create policy "Admins can access all evaluation rubric breakdowns"
on public.evaluation_rubric_breakdowns
for all
to authenticated
using (
  public.is_admin()
)
with check (
  public.is_admin()
);

create policy "Professors can read breakdowns for own exams"
on public.evaluation_rubric_breakdowns
for select
to authenticated
using (
  public.is_professor()
  and exists (
    select 1
    from public.evaluations ev
    join public.exams e on e.id = ev.exam_id
    where ev.id = evaluation_rubric_breakdowns.evaluation_id
      and e.professor_id = auth.uid()
  )
);

create policy "Professors can create breakdowns for own exams"
on public.evaluation_rubric_breakdowns
for insert
to authenticated
with check (
  public.is_professor()

  -- Breakdown must belong to an evaluation of professor's own exam
  and exists (
    select 1
    from public.evaluations ev
    join public.exams e on e.id = ev.exam_id
    where ev.id = evaluation_rubric_breakdowns.evaluation_id
      and e.professor_id = auth.uid()
  )

  -- Rubric, if present, must belong to the same exam as the evaluation
  and (
    evaluation_rubric_breakdowns.rubric_id is null
    or exists (
      select 1
      from public.evaluations ev
      join public.rubrics r on r.id = evaluation_rubric_breakdowns.rubric_id
      join public.questions q on q.id = r.question_id
      where ev.id = evaluation_rubric_breakdowns.evaluation_id
        and q.exam_id = ev.exam_id
    )
  )
);

create policy "Professors can update breakdowns for own exams"
on public.evaluation_rubric_breakdowns
for update
to authenticated
using (
  public.is_professor()
  and exists (
    select 1
    from public.evaluations ev
    join public.exams e on e.id = ev.exam_id
    where ev.id = evaluation_rubric_breakdowns.evaluation_id
      and e.professor_id = auth.uid()
  )
)
with check (
  public.is_professor()

  and exists (
    select 1
    from public.evaluations ev
    join public.exams e on e.id = ev.exam_id
    where ev.id = evaluation_rubric_breakdowns.evaluation_id
      and e.professor_id = auth.uid()
  )

  and (
    evaluation_rubric_breakdowns.rubric_id is null
    or exists (
      select 1
      from public.evaluations ev
      join public.rubrics r on r.id = evaluation_rubric_breakdowns.rubric_id
      join public.questions q on q.id = r.question_id
      where ev.id = evaluation_rubric_breakdowns.evaluation_id
        and q.exam_id = ev.exam_id
    )
  )
);

create policy "Professors can delete breakdowns for own exams"
on public.evaluation_rubric_breakdowns
for delete
to authenticated
using (
  public.is_professor()
  and exists (
    select 1
    from public.evaluations ev
    join public.exams e on e.id = ev.exam_id
    where ev.id = evaluation_rubric_breakdowns.evaluation_id
      and e.professor_id = auth.uid()
  )
);