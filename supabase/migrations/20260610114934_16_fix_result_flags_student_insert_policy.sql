-- =========================================================
-- 16_fix_result_flags_student_insert_policy
-- Fix student result flag insert RLS by using SECURITY DEFINER helper.
-- =========================================================

create or replace function public.can_student_create_result_flag(
  flag_exam_id uuid,
  flag_exam_student_id uuid,
  flag_evaluation_id uuid,
  flag_student_id uuid
)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1
    from public.profiles p
    join public.evaluations ev
      on ev.id = flag_evaluation_id
     and ev.exam_id = flag_exam_id
     and ev.status = 'published'::public.evaluation_status
    join public.student_answers sa
      on sa.id = ev.student_answer_id
    join public.exam_students es
      on es.id = sa.exam_student_id
     and es.id = flag_exam_student_id
    join public.exams e
      on e.id = ev.exam_id
     and e.id = flag_exam_id
     and e.status = 'published'::public.exam_status
    where p.id = auth.uid()
      and p.role = 'student'::public.user_role
      and flag_student_id = auth.uid()
      and (
        es.profile_id = auth.uid()
        or lower(es.email) = lower(p.email)
      )
  );
$$;

revoke all on function public.can_student_create_result_flag(uuid, uuid, uuid, uuid)
from public;

grant execute on function public.can_student_create_result_flag(uuid, uuid, uuid, uuid)
to authenticated;

drop policy if exists "Students can create flags for own published results"
on public.result_flags;

create policy "Students can create flags for own published results"
on public.result_flags
for insert
to authenticated
with check (
  public.is_student()
  and student_id = auth.uid()
  and status = 'open'::public.flag_status
  and professor_response is null
  and resolved_by is null
  and resolved_at is null
  and public.can_student_create_result_flag(
    exam_id,
    exam_student_id,
    evaluation_id,
    student_id
  )
);