# Schema Map

This document will explain the database schema of the AI Evaluation Platform.

## Core Areas

1. Identity and roles
2. Exams and questions
3. Answer uploads and import pipeline
4. Rubrics and model answers
5. AI evaluation pipeline
6. Professor review workflow
7. Student results and flags
8. Audit logs

## profiles

Stores app-level identity information for each authenticated user.

Relation:

- `profiles.id` references `auth.users.id`

Important fields:

- `full_name`
- `email`
- `role`: admin / professor / student
- `created_at`
- `updated_at`

Purpose:

Supabase Auth identifies the user.  
The profiles table identifies the user's application role.

Default role:

- `student`

RLS:

- Enabled
- Policies will be added later

## RLS Helper Functions

These functions are used inside RLS policies to avoid direct recursive reads from `profiles`.

### get_user_role(user_uuid)

Returns the app role of a specific user.

### current_user_role()

Returns the app role of the currently authenticated user.

### has_role(required_role)

Returns true if the current authenticated user has the required role.

### is_admin()

Returns true if the current authenticated user is admin.

### is_professor()

Returns true if the current authenticated user is professor.

### is_student()

Returns true if the current authenticated user is student.

Important:

Role alone is not enough for access.

Professor policies must also check ownership, such as:

- `exam.professor_id = auth.uid()`

Student policies must also check ownership and published status, such as:

- result belongs to student
- evaluation is published

### profiles RLS Rules

Read:

- Users can read their own profile.
- Admins can read all profiles.

Update:

- Users can update their own basic profile.
- Non-admin users cannot change `id`, `email`, or `role`.
- Admins can update all profiles, including role changes.

Insert:

- No direct client insert policy.
- Profiles are created automatically through the auth user trigger.

Delete:

- No client delete policy.

Security note:

- Role checks use RLS helper functions such as `is_admin()`.
- This avoids direct recursive reads from `profiles` inside `profiles` policies.

## exams

Stores exam/evaluation sessions created by professors.

Relation:

- `exams.professor_id` references `profiles.id`

Important fields:

- `title`
- `subject`
- `course`
- `batch`
- `total_marks`
- `status`
- `published_at`

RLS:

- Enabled
- Policies will be added later

## questions

Stores questions belonging to an exam.

Relation:

- `questions.exam_id` references `exams.id`

Important fields:

- `question_no`
- `question_order`
- `question_text`
- `question_type`
- `max_marks`
- `model_answer`
- `model_answer_status`
- `ai_generated_model_answer`

RLS:

- Enabled
- Policies will be added later

## rubrics

Stores rubric criteria for each question.

Relation:

- `rubrics.question_id` references `questions.id`

Important fields:

- `criterion_order`
- `criterion_name`
- `criterion_description`
- `max_marks`

RLS:

- Enabled
- Policies will be added later

## Exam / Question / Rubric RLS Rules

### exams

Admin:

- Can access all exams.

Professor:

- Can read own exams.
- Can create exams only with `professor_id = auth.uid()`.
- Can update own non-archived exams.
- Can delete only own draft exams.

Student:

- No direct access at this stage.

### questions

Admin:

- Can access all questions.

Professor:

- Can read questions belonging to own exams.
- Can create questions only inside own exams.
- Can update questions belonging to own exams.
- Can delete questions belonging to own exams.

Student:

- No direct access at this stage.

### rubrics

Admin:

- Can access all rubrics.

Professor:

- Can read rubrics for questions belonging to own exams.
- Can create rubrics for questions belonging to own exams.
- Can update rubrics for questions belonging to own exams.
- Can delete rubrics for questions belonging to own exams.

Student:

- No direct access at this stage.

## answer_uploads

Stores uploaded CSV/JSON metadata and parsing/mapping state.

Relation:

- `answer_uploads.exam_id` references `exams.id`
- `answer_uploads.uploaded_by` references `profiles.id`

Important fields:

- `file_name`
- `file_type`
- `storage_path`
- `total_rows`
- `detected_columns`
- `response_columns`
- `raw_preview`
- `mapping_config`
- `status`
- `error_message`

RLS:

- Enabled
- Policies will be added later

## exam_students

Stores normalized student records imported from uploaded answer file.

Relation:

- `exam_students.exam_id` references `exams.id`
- `exam_students.upload_id` references `answer_uploads.id`
- `exam_students.profile_id` optionally references `profiles.id`

Important fields:

- `first_name`
- `last_name`
- `id_number`
- `email`
- `source_row_index`
- `raw_row`

RLS:

- Enabled
- Policies will be added later

## student_answers

Stores normalized question-wise answers for imported students.

Relation:

- `student_answers.exam_id` references `exams.id`
- `student_answers.exam_student_id` references `exam_students.id`
- `student_answers.question_id` references `questions.id`

Important fields:

- `response_column`
- `answer_text`
- `raw_answer`
- `word_count`
- `character_count`

RLS:

- Enabled
- Policies will be added later


## Answer Upload RLS Rules

### answer_uploads

Admin:

- Can access all upload records.

Professor:

- Can read uploads for own exams.
- Can create uploads only for own exams.
- `uploaded_by` must be current professor.
- Can update uploads for own exams.
- Can delete only non-imported uploads for own exams.

Student:

- No direct access at this stage.

### exam_students

Admin:

- Can access all imported student records.

Professor:

- Can read imported students for own exams.
- Can create imported students for own exams.
- Upload must belong to the same exam.
- Can update imported students for own exams.
- Can delete imported students for own exams.

Student:

- No direct access at this stage.

### student_answers

Admin:

- Can access all student answers.

Professor:

- Can read student answers for own exams.
- Can create student answers for own exams.
- Imported student must belong to same exam.
- Question must belong to same exam.
- Can update student answers for own exams.
- Can delete student answers for own exams.

Student:

- No direct access at this stage.

## evaluation_jobs

Tracks AI batch evaluation runs.

Relation:

- `evaluation_jobs.exam_id` references `exams.id`
- `evaluation_jobs.created_by` references `profiles.id`

Important fields:

- `status`
- `total_items`
- `completed_items`
- `failed_items`
- `started_at`
- `completed_at`
- `error_message`
- `job_metadata`

Purpose:

One job can evaluate many student answers.

RLS:

- Enabled
- Policies will be added later

## evaluations

Stores AI, professor, and final evaluation for each student answer.

Relation:

- `evaluations.exam_id` references `exams.id`
- `evaluations.student_answer_id` references `student_answers.id`
- `evaluations.ai_job_id` optionally references `evaluation_jobs.id`

Important fields:

- `ai_score`
- `professor_score`
- `final_score`
- `max_marks`
- `quality_label`
- `ai_confidence`
- `ai_feedback`
- `professor_feedback`
- `teacher_review_summary`
- `student_facing_justification`
- `what_student_did_well`
- `what_is_missing`
- `ai_raw_output`
- `status`

Purpose:

AI suggests. Professor reviews. Final score is published.

RLS:

- Enabled
- Policies will be added later

## evaluation_rubric_breakdowns

Stores criterion-wise scoring for each evaluation.

Relation:

- `evaluation_rubric_breakdowns.evaluation_id` references `evaluations.id`
- `evaluation_rubric_breakdowns.rubric_id` optionally references `rubrics.id`

Important fields:

- `criterion_name`
- `criterion_description`
- `max_marks`
- `ai_awarded_marks`
- `professor_awarded_marks`
- `final_awarded_marks`
- `ai_reason`
- `professor_reason`

Purpose:

Keeps rubric-wise evidence for professor review and student-facing explanation.

RLS:

- Enabled
- Policies will be added later

## Evaluation RLS Rules

### evaluation_jobs

Admin:

- Can access all evaluation jobs.

Professor:

- Can read AI jobs for own exams.
- Can create AI jobs for own exams.
- `created_by` must be current professor.
- Can update AI jobs for own exams.
- Can delete only queued, failed, or cancelled jobs for own exams.

Student:

- No direct access at this stage.

### evaluations

Admin:

- Can access all evaluations.

Professor:

- Can read evaluations for own exams.
- Can create evaluations for own exams.
- Student answer must belong to same exam.
- AI job, if present, must belong to same exam.
- Can update evaluations for own exams.
- Can delete only pending / AI-checked / professor-review-pending evaluations for own exams.

Student:

- No direct access to raw/internal evaluations at this stage.
- Student-facing published result access will be added later.

### evaluation_rubric_breakdowns

Admin:

- Can access all rubric breakdowns.

Professor:

- Can read rubric breakdowns for own exam evaluations.
- Can create rubric breakdowns for own exam evaluations.
- Rubric, if linked, must belong to same exam as the evaluation.
- Can update rubric breakdowns for own exam evaluations.
- Can delete rubric breakdowns for own exam evaluations.

Student:

- No direct access at this stage.

## Student Result Access

Student result access is handled through a safe RPC function:

- `get_my_published_results()`

Reason:

Students must not get direct access to internal evaluation columns such as:

- `ai_raw_output`
- `ai_confidence`
- `professor_feedback`
- `teacher_review_summary`
- internal review user IDs

The RPC returns only student-safe published result data:

- exam title
- subject/course/batch
- published date
- student name/id/email
- total score
- total max marks
- question-wise final marks
- student-facing justification
- what student did well
- what is missing
- rubric-wise final marks and final reason

Student ownership is determined through:

- `exam_students.profile_id = auth.uid()`
- or `lower(exam_students.email) = lower(current user's profile email)`

Direct student SELECT policies on `evaluations` are intentionally not added.

## result_flags

Stores student-raised objections or queries on published question-wise evaluations.

Relation:

- `result_flags.exam_id` references `exams.id`
- `result_flags.exam_student_id` references `exam_students.id`
- `result_flags.evaluation_id` references `evaluations.id`
- `result_flags.student_id` references `profiles.id`
- `result_flags.resolved_by` references `profiles.id`

Important fields:

- `status`
- `student_message`
- `professor_response`
- `resolved_by`
- `resolved_at`

Status values:

- `open`
- `under_review`
- `resolved`
- `rejected`

Rules:

- Student can raise a flag only on own published result.
- Student cannot flag unpublished evaluations.
- Student cannot flag other students' evaluations.
- Student can have only one active flag per evaluation.
- Professor can read/update flags only for own exams.
- Professor can resolve or reject flags.

## Master Question Bank Foundation

From Step 40 onward, the `questions` table should be treated as the master question bank for an exam.

### Exam Mode

`exams.exam_mode` controls how uploaded answer responses should be mapped.

Values:

- `fixed_paper`
- `randomized_question_bank`

Meaning:

- `fixed_paper`: all students receive the same question order; response-column mapping can be used.
- `randomized_question_bank`: students may receive different questions/order; answer-cell mapping is required.

### Question Bank Fields

Additional fields on `questions`:

- `question_code`: stable code for a master question bank item.
- `is_ai_evaluable`: whether the question should enter subjective AI evaluation.
- `question_category`: flexible category label such as concept, case_based, essay, objective.
- `expected_answer_format`: optional expected answer style such as one_line, paragraph, case_analysis, essay.

Subjective manual question creation remains supported. Objective question options will be added in a later step.

## Rubric Templates

Rubric templates reduce repeated rubric creation.

Tables:

- `rubric_templates`
- `rubric_template_criteria`

Purpose:

Professor can create a small number of exam-level/category-level templates, such as:

- Case Based 15 Marks
- Long Answer 10 Marks
- Essay 20 Marks

These templates are source templates only. The existing `rubrics` table remains the final question-level rubric source used by the AI evaluation pipeline.

Future flow:

1. Professor creates rubric template.
2. Professor applies template to matching questions.
3. Template criteria are copied/materialized into `rubrics`.
4. AI evaluation continues using `rubrics`.

Security:

- Professors can access templates only for their own exams.
- Admins can access all templates.
- Students have no access to rubric templates.