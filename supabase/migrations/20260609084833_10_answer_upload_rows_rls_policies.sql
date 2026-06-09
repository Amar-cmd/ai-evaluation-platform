-- =========================================================
-- 10_answer_upload_rows_rls_policies
-- RLS policies for answer_upload_rows staging table
-- =========================================================

alter table public.answer_upload_rows enable row level security;

drop policy if exists "Admins can access all answer upload rows"
on public.answer_upload_rows;

drop policy if exists "Professors can read upload rows for own exams"
on public.answer_upload_rows;

drop policy if exists "Professors can create upload rows for own exams"
on public.answer_upload_rows;

drop policy if exists "Professors can update upload rows for own exams"
on public.answer_upload_rows;

drop policy if exists "Professors can delete upload rows for own exams"
on public.answer_upload_rows;

create policy "Admins can access all answer upload rows"
on public.answer_upload_rows
for all
to authenticated
using (
  public.is_admin()
)
with check (
  public.is_admin()
);

create policy "Professors can read upload rows for own exams"
on public.answer_upload_rows
for select
to authenticated
using (
  public.is_professor()
  and exists (
    select 1
    from public.exams e
    where e.id = answer_upload_rows.exam_id
      and e.professor_id = auth.uid()
  )
);

create policy "Professors can create upload rows for own exams"
on public.answer_upload_rows
for insert
to authenticated
with check (
  public.is_professor()
  and exists (
    select 1
    from public.exams e
    where e.id = answer_upload_rows.exam_id
      and e.professor_id = auth.uid()
  )
  and exists (
    select 1
    from public.answer_uploads au
    where au.id = answer_upload_rows.upload_id
      and au.exam_id = answer_upload_rows.exam_id
  )
);

create policy "Professors can update upload rows for own exams"
on public.answer_upload_rows
for update
to authenticated
using (
  public.is_professor()
  and exists (
    select 1
    from public.exams e
    where e.id = answer_upload_rows.exam_id
      and e.professor_id = auth.uid()
  )
)
with check (
  public.is_professor()
  and exists (
    select 1
    from public.exams e
    where e.id = answer_upload_rows.exam_id
      and e.professor_id = auth.uid()
  )
  and exists (
    select 1
    from public.answer_uploads au
    where au.id = answer_upload_rows.upload_id
      and au.exam_id = answer_upload_rows.exam_id
  )
);

create policy "Professors can delete upload rows for own exams"
on public.answer_upload_rows
for delete
to authenticated
using (
  public.is_professor()
  and exists (
    select 1
    from public.exams e
    where e.id = answer_upload_rows.exam_id
      and e.professor_id = auth.uid()
  )
);