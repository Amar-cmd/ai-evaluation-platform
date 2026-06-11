-- =========================================================
-- 19_rubric_template_materialization_metadata
-- Adds source metadata to question-level rubrics so that
-- rubrics generated from templates can be identified later.
-- Existing rubrics still work normally.
-- =========================================================

alter table public.rubrics
add column if not exists source_template_id uuid
references public.rubric_templates(id)
on delete set null;

alter table public.rubrics
add column if not exists source_template_criterion_id uuid
references public.rubric_template_criteria(id)
on delete set null;

alter table public.rubrics
add column if not exists is_template_generated boolean
not null default false;

create index if not exists rubrics_source_template_id_idx
on public.rubrics(source_template_id);

create index if not exists rubrics_source_template_criterion_id_idx
on public.rubrics(source_template_criterion_id);

create index if not exists rubrics_is_template_generated_idx
on public.rubrics(is_template_generated);

comment on column public.rubrics.source_template_id is
'Optional source rubric template used to generate this question-level rubric row.';

comment on column public.rubrics.source_template_criterion_id is
'Optional source template criterion used to generate this question-level rubric row.';

comment on column public.rubrics.is_template_generated is
'True when this question-level rubric row was materialized from a rubric template.';