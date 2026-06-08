import { NextResponse, type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

export async function proxy(request: NextRequest) {
  console.log("PROXY RUNNING:", request.nextUrl.pathname);
  const { supabaseResponse, user } = await updateSession(request);

  const pathname = request.nextUrl.pathname;

  const protectedRoutes = ["/dashboard", "/professor", "/student", "/admin"];

  const authRoutes = ["/login", "/signup"];

  const isProtectedRoute = protectedRoutes.some((route) =>
    pathname.startsWith(route),
  );

  const isAuthRoute = authRoutes.some((route) => pathname.startsWith(route));

  if (isProtectedRoute && !user) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("redirectedFrom", pathname);

    return NextResponse.redirect(loginUrl);
  }

  if (isAuthRoute && user) {
    return NextResponse.redirect(new URL("/dashboard", request.url));
  }

  return supabaseResponse;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
