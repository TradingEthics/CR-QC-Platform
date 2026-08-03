import { auth, authConfigured } from "@/auth";
import { canAccessPath, DEFAULT_ROLE } from "@/lib/rbac";

export default auth((req) => {
  // Until Google OAuth is configured, leave the app open (local dev).
  if (!authConfigured) return;

  const { pathname } = req.nextUrl;
  const isPublic =
    pathname.startsWith("/signin") || pathname.startsWith("/api/auth");
  if (isPublic) return;

  // Not signed in → sign-in page.
  if (!req.auth) {
    return Response.redirect(new URL("/signin", req.nextUrl.origin));
  }

  // The cron endpoint authenticates via CRON_SECRET, not a session (see route).
  if (pathname.startsWith("/api/cron")) return;

  // Role gating for app pages.
  const role = req.auth.user?.role ?? DEFAULT_ROLE;
  if (!canAccessPath(role, pathname)) {
    return Response.redirect(new URL("/dashboard", req.nextUrl.origin));
  }
});

export const config = {
  // Run on everything except static assets.
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.svg).*)"],
};
