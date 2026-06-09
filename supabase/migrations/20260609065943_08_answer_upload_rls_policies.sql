-- =========================================================
-- 08_answer_upload_rls_policies
-- RLS policies for answer_uploads, exam_students, student_answers
-- =========================================================

-- ---------------------------------------------------------
-- Ensure RLS is enabled
-- ---------------------------------------------------------
alter table public.answer_uploads enable row level security;
alter table public.exam_students enable row level security;
alter table public.student_answers enable row level security;

-- ---------------------------------------------------------
-- Drop existing policies for clean development re-runs
-- ---------------------------------------------------------

-- answer_uploads
drop policy if exists "Admins can access all answer uploads"
on public.answer_uploads;

drop policy if exists "Professors can read uploads for own exams"
on public.answer_uploads;

drop policy if exists "Professors can create uploads for own exams"
on public.answer_uploads;

drop policy if exists "Professors can update uploads for own exams"
on public.answer_uploads;

drop policy if exists "Professors can delete non-imported uploads for own exams"
on public.answer_uploads;

-- exam_students
drop policy if exists "Admins can access all exam students"
on public.exam_students;

drop policy if exists "Professors can read students for own exams"
on public.exam_students;

drop policy if exists "Professors can create students for own exams"
on public.exam_students;

drop policy if exists "Professors can update students for own exams"
on public.exam_students;

drop policy if exists "Professors can delete students for own exams"
on public.exam_students;

-- student_answers
drop policy if exists "Admins can access all student answers"
on public.student_answers;

drop policy if exists "Professors can read answers for own exams"
on public.student_answers;

drop policy if exists "Professors can create answers for own exams"
on public.student_answers;

drop policy if exists "Professors can update answers for own exams"
on public.student_answers;

drop policy if exists "Professors can delete answers for own exams"
on public.student_answers;

-- =========================================================
-- ANSWER_UPLOADS POLICIES
-- =========================================================

-- Admin can access all uploads
create policy "Admins can access all answer uploads"
on public.answer_uploads
for all
to authenticated
using (
  public.is_admin()
)
with check (
  public.is_admin()
);

-- Professor can read uploads for own exams
create policy "Professors can read uploads for own exams"
on public.answer_uploads
for select
to authenticated
using (
  public.is_professor()
  and exists (
    select 1
    from public.exams e
    where e.id = answer_uploads.exam_id
      and e.professor_id = auth.uid()
  )
);

-- Professor can create uploads only for own exams
create policy "Professors can create uploads for own exams"
on public.answer_uploads
for insert
to authenticated
with check (
  public.is_professor()
  and uploaded_by = auth.uid()
  and exists (
    select 1
    from public.exams e
    where e.id = answer_uploads.exam_id
      and e.professor_id = auth.uid()
  )
);

-- Professor can update uploads for own exams
create policy "Professors can update uploads for own exams"
on public.answer_uploads
for update
to authenticated
using (
  public.is_professor()
  and exists (
    select 1
    from public.exams e
    where e.id = answer_uploads.exam_id
      and e.professor_id = auth.uid()
  )
)
with check (
  public.is_professor()
  and uploaded_by = auth.uid()
  and exists (
    select 1
    from public.exams e
    where e.id = answer_uploads.exam_id
      and e.professor_id = auth.uid()
  )
);

-- Professor can delete only non-imported uploads for own exams
create policy "Professors can delete non-imported uploads for own exams"
on public.answer_uploads
for delete
to authenticated
using (
  public.is_professor()
  and status <> 'imported'
  and exists (
    select 1
    from public.exams e
    where e.id = answer_uploads.exam_id
      and e.professor_id = auth.uid()
  )
);

-- =========================================================
-- EXAM_STUDENTS POLICIES
-- =========================================================

-- Admin can access all imported student records
create policy "Admins can access all exam students"
on public.exam_students
for all
to authenticated
using (
  public.is_admin()
)
with check (
  public.is_admin()
);

-- Professor can read imported students for own exams
create policy "Professors can read students for own exams"
on public.exam_students
for select
to authenticated
using (
  public.is_professor()
  and exists (
    select 1
    from public.exams e
    where e.id = exam_students.exam_id
      and e.professor_id = auth.uid()
  )
);

-- Professor can create imported students for own exams
create policy "Professors can create students for own exams"
on public.exam_students
for insert
to authenticated
with check (
  public.is_professor()
  and exists (
    select 1
    from public.exams e
    where e.id = exam_students.exam_id
      and e.professor_id = auth.uid()
  )
  and exists (
    select 1
    from public.answer_uploads au
    where au.id = exam_students.upload_id
      and au.exam_id = exam_students.exam_id
  )
);

-- Professor can update imported students for own exams
create policy "Professors can update students for own exams"
on public.exam_students
for update
to authenticated
using (
  public.is_professor()
  and exists (
    select 1
    from public.exams e
    where e.id = exam_students.exam_id
      and e.professor_id = auth.uid()
  )
)
with check (
  public.is_professor()
  and exists (
    select 1
    from public.exams e
    where e.id = exam_students.exam_id
      and e.professor_id = auth.uid()
  )
  and exists (
    select 1
    from public.answer_uploads au
    where au.id = exam_students.upload_id
      and au.exam_id = exam_students.exam_id
  )
);

-- Professor can delete imported students for own exams
create policy "Professors can delete students for own exams"
on public.exam_students
for delete
to authenticated
using (
  public.is_professor()
  and exists (
    select 1
    from public.exams e
    where e.id = exam_students.exam_id
      and e.professor_id = auth.uid()
  )
);

-- =========================================================
-- STUDENT_ANSWERS POLICIES
-- =========================================================

-- Admin can access all student answers
create policy "Admins can access all student answers"
on public.student_answers
for all
to authenticated
using (
  public.is_admin()
)
with check (
  public.is_admin()
);

-- Professor can read student answers for own exams
create policy "Professors can read answers for own exams"
on public.student_answers
for select
to authenticated
using (
  public.is_professor()
  and exists (
    select 1
    from public.exams e
    where e.id = student_answers.exam_id
      and e.professor_id = auth.uid()
  )
);

-- Professor can create student answers for own exams
create policy "Professors can create answers for own exams"
on public.student_answers
for insert
to authenticated
with check (
  public.is_professor()

  -- Answer must belong to professor's own exam
  and exists (
    select 1
    from public.exams e
    where e.id = student_answers.exam_id
      and e.professor_id = auth.uid()
  )

  -- Imported student must belong to the same exam
  and exists (
    select 1
    from public.exam_students es
    where es.id = student_answers.exam_student_id
      and es.exam_id = student_answers.exam_id
  )

  -- Question must belong to the same exam
  and exists (
    select 1
    from public.questions q
    where q.id = student_answers.question_id
      and q.exam_id = student_answers.exam_id
  )
);

-- Professor can update student answers for own exams
create policy "Professors can update answers for own exams"
on public.student_answers
for update
to authenticated
using (
  public.is_professor()
  and exists (
    select 1
    from public.exams e
    where e.id = student_answers.exam_id
      and e.professor_id = auth.uid()
  )
)
with check (
  public.is_professor()

  and exists (
    select 1
    from public.exams e
    where e.id = student_answers.exam_id
      and e.professor_id = auth.uid()
  )

  and exists (
    select 1
    from public.exam_students es
    where es.id = student_answers.exam_student_id
      and es.exam_id = student_answers.exam_id
  )

  and exists (
    select 1
    from public.questions q
    where q.id = student_answers.question_id
      and q.exam_id = student_answers.exam_id
  )
);

-- Professor can delete student answers for own exams
create policy "Professors can delete answers for own exams"
on public.student_answers
for delete
to authenticated
using (
  public.is_professor()
  and exists (
    select 1
    from public.exams e
    where e.id = student_answers.exam_id
      and e.professor_id = auth.uid()
  )
);