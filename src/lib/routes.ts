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
  },

  STUDENT: {
    DASHBOARD: "/student/dashboard",
    RESULTS: "/student/results",
  },

  ADMIN: {
    DASHBOARD: "/admin/dashboard",
  },
} as const;
