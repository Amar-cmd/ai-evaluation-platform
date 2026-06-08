-- =========================================================
-- 00_extensions_and_enums
-- Foundation migration for AI Evaluation Platform
-- =========================================================

-- Required extension for UUID generation.
create extension if not exists "pgcrypto";

-- ---------------------------------------------------------
-- User roles
-- ---------------------------------------------------------
do $$
begin
  if not exists (select 1 from pg_type where typname = 'user_role') then
    create type public.user_role as enum (
      'admin',
      'professor',
      'student'
    );
  end if;
end
$$;

-- ---------------------------------------------------------
-- Exam lifecycle status
-- ---------------------------------------------------------
do $$
begin
  if not exists (select 1 from pg_type where typname = 'exam_status') then
    create type public.exam_status as enum (
      'draft',
      'questions_added',
      'answers_uploaded',
      'mapped',
      'rubric_ready',
      'ai_running',
      'ai_completed',
      'review_in_progress',
      'approved',
      'published',
      'archived'
    );
  end if;
end
$$;

-- ---------------------------------------------------------
-- Answer upload/import status
-- ---------------------------------------------------------
do $$
begin
  if not exists (select 1 from pg_type where typname = 'upload_status') then
    create type public.upload_status as enum (
      'uploaded',
      'parsed',
      'parse_failed',
      'mapping_pending',
      'mapped',
      'imported'
    );
  end if;
end
$$;

-- ---------------------------------------------------------
-- Evaluation status
-- ---------------------------------------------------------
do $$
begin
  if not exists (select 1 from pg_type where typname = 'evaluation_status') then
    create type public.evaluation_status as enum (
      'pending',
      'ai_checked',
      'professor_review_pending',
      'modified_by_professor',
      'approved',
      'published',
      'flagged_by_student',
      'revised_after_flag'
    );
  end if;
end
$$;

-- ---------------------------------------------------------
-- Student flag / objection status
-- ---------------------------------------------------------
do $$
begin
  if not exists (select 1 from pg_type where typname = 'flag_status') then
    create type public.flag_status as enum (
      'open',
      'under_review',
      'resolved',
      'rejected'
    );
  end if;
end
$$;

-- ---------------------------------------------------------
-- Question type
-- ---------------------------------------------------------
do $$
begin
  if not exists (select 1 from pg_type where typname = 'question_type') then
    create type public.question_type as enum (
      'short_answer',
      'long_answer',
      'case_based',
      'essay',
      'other'
    );
  end if;
end
$$;

-- ---------------------------------------------------------
-- Model answer approval status
-- ---------------------------------------------------------
do $$
begin
  if not exists (select 1 from pg_type where typname = 'model_answer_status') then
    create type public.model_answer_status as enum (
      'not_provided',
      'ai_generated_pending_review',
      'approved',
      'edited_by_professor'
    );
  end if;
end
$$;

-- ---------------------------------------------------------
-- AI confidence label
-- ---------------------------------------------------------
do $$
begin
  if not exists (select 1 from pg_type where typname = 'ai_confidence') then
    create type public.ai_confidence as enum (
      'low',
      'medium',
      'high'
    );
  end if;
end
$$;

-- ---------------------------------------------------------
-- Answer quality label
-- ---------------------------------------------------------
do $$
begin
  if not exists (select 1 from pg_type where typname = 'quality_label') then
    create type public.quality_label as enum (
      'weak',
      'average',
      'good',
      'excellent'
    );
  end if;
end
$$;