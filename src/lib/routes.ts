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
  },

  STUDENT: {
    DASHBOARD: "/student/dashboard",
    RESULTS: "/student/results",
  },

  ADMIN: {
    DASHBOARD: "/admin/dashboard",
  },
} as const