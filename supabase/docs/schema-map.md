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

