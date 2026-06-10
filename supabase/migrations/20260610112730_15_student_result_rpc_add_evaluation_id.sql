-- =========================================================
-- 15_student_result_rpc_add_evaluation_id
-- Adds evaluation_id inside question_results JSON.
-- Needed so students can raise flags on specific question results.
-- =========================================================

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

      ev.id as evaluation_id,
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
        'evaluation_id', qr.evaluation_id,
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

revoke all on function public.get_my_published_results()
from public;

grant execute on function public.get_my_published_results()
to authenticated;