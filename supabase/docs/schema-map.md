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