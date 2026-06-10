export const ROUTES = {
  HOME: "/",

  AUTH: {
    LOGIN: "/login",
    SIGNUP: "/signup",
  },

  PROFESSOR: {
    DASHBOARD: "/professor/dashboard",
    EXAMS: "/professor/exams",
    NEW_EXAM: "/professor/exams/new",
    EXAM_DETAIL: (examId: string) => `/professor/exams/${examId}`,
    NEW_ANSWER_UPLOAD: (examId: string) =>
      `/professor/exams/${examId}/uploads/new`,
    MAP_ANSWER_UPLOAD: (examId: string, uploadId: string) =>
  `/professor/exams/${examId}/uploads/${uploadId}/map`,
    EXAM_REVIEW: (examId: string) => `/professor/exams/${examId}/review`,
    EXAM_FLAGS: (examId: string) => `/professor/exams/${examId}/flags`,
  },

  STUDENT: {
    DASHBOARD: "/student/dashboard",
    RESULTS: "/student/results",
  },

  ADMIN: {
    DASHBOARD: "/admin/dashboard",
  },
} as const;
