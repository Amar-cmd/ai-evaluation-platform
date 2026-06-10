-- =========================================================
-- 14_result_flags_schema_rls
-- Student result query / objection system
-- =========================================================

create table if not exists public.result_flags (
  id uuid primary key default gen_random_uuid(),

  exam_id uuid not null references public.exams(id) on delete cascade,
  exam_student_id uuid not null references public.exam_students(id) on delete cascade,
  evaluation_id uuid not null references public.evaluations(id) on delete cascade,

  student_id uuid not null references public.profiles(id) on delete cascade,

  status public.flag_status not null default 'open',

  student_message text not null,
  professor_response text,

  resolved_by uuid references public.profiles(id) on delete set null,
  resolved_at timestamptz,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  check (length(trim(student_message)) > 0)
);

-- ---------------------------------------------------------
-- Indexes
-- ---------------------------------------------------------

create index if not exists result_flags_exam_id_idx
on public.result_flags(exam_id);

create index if not exists result_flags_exam_student_id_idx
on public.result_flags(exam_student_id);

create index if not exists result_flags_evaluation_id_idx
on public.result_flags(evaluation_id);

create index if not exists result_flags_student_id_idx
on public.result_flags(student_id);

create index if not exists result_flags_status_idx
on public.result_flags(status);

-- One active flag per student per evaluation.
-- After resolved/rejected, student can raise another flag if needed.
create unique index if not exists result_flags_one_active_per_student_evaluation_idx
on public.result_flags(evaluation_id, student_id)
where status in (
  'open'::public.flag_status,
  'under_review'::public.flag_status
);

-- ---------------------------------------------------------
-- updated_at trigger
-- ---------------------------------------------------------

drop trigger if exists set_result_flags_updated_at
on public.result_flags;

create trigger set_result_flags_updated_at
before update on public.result_flags
for each row
execute function public.set_updated_at();

-- ---------------------------------------------------------
-- Prevent identity columns from changing after creation.
-- Professor should resolve/respond, not move a flag to another student/evaluation.
-- ---------------------------------------------------------

create or replace function public.prevent_result_flag_identity_change()
returns trigger
language plpgsql
as $$
begin
  if new.exam_id is distinct from old.exam_id then
    raise exception 'exam_id cannot be changed.';
  end if;

  if new.exam_student_id is distinct from old.exam_student_id then
    raise exception 'exam_student_id cannot be changed.';
  end if;

  if new.evaluation_id is distinct from old.evaluation_id then
    raise exception 'evaluation_id cannot be changed.';
  end if;

  if new.student_id is distinct from old.student_id then
    raise exception 'student_id cannot be changed.';
  end if;

  return new;
end;
$$;

drop trigger if exists prevent_result_flag_identity_change_trigger
on public.result_flags;

create trigger prevent_result_flag_identity_change_trigger
before update on public.result_flags
for each row
execute function public.prevent_result_flag_identity_change();

-- ---------------------------------------------------------
-- Enable RLS
-- ---------------------------------------------------------

alter table public.result_flags enable row level security;

grant select, insert, update, delete
on public.result_flags
to authenticated;

-- ---------------------------------------------------------
-- Drop old policies for clean dev re-runs
-- ---------------------------------------------------------

drop policy if exists "Admins can access all result flags"
on public.result_flags;

drop policy if exists "Students can read own result flags"
on public.result_flags;

drop policy if exists "Students can create flags for own published results"
on public.result_flags;

drop policy if exists "Professors can read flags for own exams"
on public.result_flags;

drop policy if exists "Professors can update flags for own exams"
on public.result_flags;

drop policy if exists "Professors can delete flags for own exams"
on public.result_flags;

-- =========================================================
-- Admin policy
-- =========================================================

create policy "Admins can access all result flags"
on public.result_flags
for all
to authenticated
using (
  public.is_admin()
)
with check (
  public.is_admin()
);

-- =========================================================
-- Student policies
-- =========================================================

create policy "Students can read own result flags"
on public.result_flags
for select
to authenticated
using (
  public.is_student()
  and student_id = auth.uid()
);

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

  -- The flagged evaluation must be a published evaluation
  -- belonging to the current student's own published result.
  and exists (
    select 1
    from public.evaluations ev
    join public.student_answers sa
      on sa.id = ev.student_answer_id
    join public.exam_students es
      on es.id = sa.exam_student_id
    join public.exams e
      on e.id = ev.exam_id
    join public.profiles p
      on p.id = auth.uid()
    where ev.id = result_flags.evaluation_id
      and ev.exam_id = result_flags.exam_id
      and ev.status = 'published'::public.evaluation_status

      and e.id = result_flags.exam_id
      and e.status = 'published'::public.exam_status

      and es.id = result_flags.exam_student_id

      and (
        es.profile_id = auth.uid()
        or lower(es.email) = lower(p.email)
      )
  )
);

-- =========================================================
-- Professor policies
-- =========================================================

create policy "Professors can read flags for own exams"
on public.result_flags
for select
to authenticated
using (
  public.is_professor()
  and exists (
    select 1
    from public.exams e
    where e.id = result_flags.exam_id
      and e.professor_id = auth.uid()
  )
);

create policy "Professors can update flags for own exams"
on public.result_flags
for update
to authenticated
using (
  public.is_professor()
  and exists (
    select 1
    from public.exams e
    where e.id = result_flags.exam_id
      and e.professor_id = auth.uid()
  )
)
with check (
  public.is_professor()
  and exists (
    select 1
    from public.exams e
    where e.id = result_flags.exam_id
      and e.professor_id = auth.uid()
  )
);

create policy "Professors can delete flags for own exams"
on public.result_flags
for delete
to authenticated
using (
  public.is_professor()
  and status = 'open'::public.flag_status
  and exists (
    select 1
    from public.exams e
    where e.id = result_flags.exam_id
      and e.professor_id = auth.uid()
  )
);