-- =========================================================
-- 13_student_result_access
-- Secure student result access using safe RPC.
-- Students do not get direct SELECT access to internal evaluation rows.
-- =========================================================

-- ---------------------------------------------------------
-- Helpful indexes for matching uploaded student rows to auth profiles
-- ---------------------------------------------------------

create index if not exists exam_students_profile_id_idx
on public.exam_students(profile_id);

create index if not exists exam_students_lower_email_idx
on public.exam_students (lower(email));

create index if not exists profiles_lower_email_idx
on public.profiles (lower(email));

-- ---------------------------------------------------------
-- Backfill profile_id on existing imported students where email matches profile
-- ---------------------------------------------------------

update public.exam_students es
set profile_id = p.id
from public.profiles p
where es.profile_id is null
  and lower(es.email) = lower(p.email);

-- ---------------------------------------------------------
-- Auto-link exam_students.profile_id when a student row is inserted/updated
-- ---------------------------------------------------------

create or replace function public.set_exam_student_profile_from_email()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.profile_id is null and new.email is not null then
    select p.id
    into new.profile_id
    from public.profiles p
    where lower(p.email) = lower(new.email)
    limit 1;
  end if;

  return new;
end;
$$;

drop trigger if exists set_exam_student_profile_from_email_trigger
on public.exam_students;

create trigger set_exam_student_profile_from_email_trigger
before insert or update of email, profile_id
on public.exam_students
for each row
execute function public.set_exam_student_profile_from_email();

-- ---------------------------------------------------------
-- Auto-link old imported rows when a matching profile is created later
-- Example: Professor uploaded answers first, student signs up later.
-- ---------------------------------------------------------

create or replace function public.link_exam_students_for_profile()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.exam_students
  set profile_id = new.id
  where profile_id is null
    and lower(email) = lower(new.email);

  return new;
end;
$$;

drop trigger if exists link_exam_students_for_profile_trigger
on public.profiles;

create trigger link_exam_students_for_profile_trigger
after insert or update of email
on public.profiles
for each row
execute function public.link_exam_students_for_profile();

-- ---------------------------------------------------------
-- Safe student-facing result RPC
-- ---------------------------------------------------------
-- This function returns only safe published result data:
-- - exam name
-- - total marks
-- - question-wise marks
-- - student-facing justification
-- - improvement points
-- - rubric-wise final marks
--
-- It intentionally does NOT return:
-- - ai_raw_output
-- - ai_confidence
-- - professor internal feedback
-- - unpublished evaluations
-- - other students' data
-- ---------------------------------------------------------

create or replace function public.get_my_published_results()
returns table (
  exam_id uuid,
  exam_title text,
  subject text,
  course text,
  batch text,
  exam_published_at timestamptz,
  exam_student_id uuid,
  student_name text,
  id_number text,
  student_email text,
  total_score numeric,
  total_max_marks numeric,
  question_results jsonb
)
language sql
security definer
set search_path = public
stable
as $$
  with me as (
    select
      p.id as user_id,
      lower(p.email) as email
    from public.profiles p
    where p.id = auth.uid()
      and p.role = 'student'::public.user_role
  ),

  own_exam_students as (
    select es.*
    from public.exam_students es
    join me
      on es.profile_id = me.user_id
      or lower(es.email) = me.email
  ),

  question_rows as (
    select
      e.id as exam_id,
      e.title as exam_title,
      e.subject,
      e.course,
      e.batch,
      e.published_at as exam_published_at,

      es.id as exam_student_id,
      trim(coalesce(es.first_name, '') || ' ' || coalesce(es.last_name, '')) as student_name,
      es.id_number,
      es.email as student_email,

      q.id as question_id,
      q.question_no,
      q.question_order,
      q.question_text,

      ev.final_score,
      ev.max_marks,
      ev.student_facing_justification,
      ev.what_student_did_well,
      ev.what_is_missing,

      coalesce(rubric_data.rubric_breakdown, '[]'::jsonb) as rubric_breakdown

    from own_exam_students es

    join public.exams e
      on e.id = es.exam_id
     and e.status = 'published'::public.exam_status

    join public.student_answers sa
      on sa.exam_student_id = es.id

    join public.questions q
      on q.id = sa.question_id

    join public.evaluations ev
      on ev.student_answer_id = sa.id
     and ev.exam_id = e.id
     and ev.status = 'published'::public.evaluation_status

    left join lateral (
      select
        jsonb_agg(
          jsonb_build_object(
            'criterion_name', erb.criterion_name,
            'max_marks', erb.max_marks,
            'awarded_marks', erb.final_awarded_marks,
            'reason', coalesce(erb.professor_reason, erb.ai_reason)
          )
          order by erb.created_at
        ) as rubric_breakdown
      from public.evaluation_rubric_breakdowns erb
      where erb.evaluation_id = ev.id
    ) rubric_data on true
  )

  select
    qr.exam_id,
    qr.exam_title,
    qr.subject,
    qr.course,
    qr.batch,
    qr.exam_published_at,
    qr.exam_student_id,
    nullif(qr.student_name, '') as student_name,
    qr.id_number,
    qr.student_email,

    sum(qr.final_score) as total_score,
    sum(qr.max_marks) as total_max_marks,

    jsonb_agg(
      jsonb_build_object(
        'question_id', qr.question_id,
        'question_no', qr.question_no,
        'question_text', qr.question_text,
        'final_score', qr.final_score,
        'max_marks', qr.max_marks,
        'student_facing_justification', qr.student_facing_justification,
        'what_student_did_well', qr.what_student_did_well,
        'what_is_missing', qr.what_is_missing,
        'rubric_breakdown', qr.rubric_breakdown
      )
      order by qr.question_order
    ) as question_results

  from question_rows qr

  group by
    qr.exam_id,
    qr.exam_title,
    qr.subject,
    qr.course,
    qr.batch,
    qr.exam_published_at,
    qr.exam_student_id,
    qr.student_name,
    qr.id_number,
    qr.student_email

  order by qr.exam_published_at desc;
$$;

-- ---------------------------------------------------------
-- Function permissions
-- ---------------------------------------------------------

revoke all on function public.set_exam_student_profile_from_email()
from public;

revoke all on function public.link_exam_students_for_profile()
from public;

revoke all on function public.get_my_published_results()
from public;

grant execute on function public.get_my_published_results()
to authenticated;

-- ---------------------------------------------------------
-- Important security note:
-- Do NOT add direct student SELECT policies on evaluations.
-- Student-safe result access must happen through get_my_published_results().
-- ---------------------------------------------------------