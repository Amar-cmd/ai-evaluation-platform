export const APP_NAME = "AI Evaluation Platform";

export const USER_ROLES = {
  ADMIN: "admin",
  PROFESSOR: "professor",
  STUDENT: "student",
} as const;

export const EXAM_STATUS = {
  DRAFT: "draft",
  QUESTIONS_ADDED: "questions_added",
  ANSWERS_UPLOADED: "answers_uploaded",
  MAPPED: "mapped",
  RUBRIC_READY: "rubric_ready",
  AI_RUNNING: "ai_running",
  AI_COMPLETED: "ai_completed",
  REVIEW_IN_PROGRESS: "review_in_progress",
  APPROVED: "approved",
  PUBLISHED: "published",
  ARCHIVED: "archived",
} as const

export const UPLOAD_STATUS = {
  UPLOADED: "uploaded",
  PARSED: "parsed",
  PARSE_FAILED: "parse_failed",
  MAPPING_PENDING: "mapping_pending",
  MAPPED: "mapped",
  IMPORTED: "imported",
} as const

export const EVALUATION_STATUS = {
  PENDING: "pending",
  AI_CHECKED: "ai_checked",
  PROFESSOR_REVIEW_PENDING: "professor_review_pending",
  MODIFIED_BY_PROFESSOR: "modified_by_professor",
  APPROVED: "approved",
  PUBLISHED: "published",
  FLAGGED_BY_STUDENT: "flagged_by_student",
  REVISED_AFTER_FLAG: "revised_after_flag",
} as const

export const FLAG_STATUS = {
  OPEN: "open",
  UNDER_REVIEW: "under_review",
  RESOLVED: "resolved",
  REJECTED: "rejected",
} as const

export const EXAM_MODE = {
  FIXED_PAPER: "fixed_paper",
  RANDOMIZED_QUESTION_BANK: "randomized_question_bank",
} as const

export const QUESTION_TYPE = {
  OBJECTIVE: "objective",
  SHORT_ANSWER: "short_answer",
  LONG_ANSWER: "long_answer",
  CASE_BASED: "case_based",
  ESSAY: "essay",
  OTHER: "other",
} as const