import { auth, authConfigured } from "@/auth";

export default auth((req) => {
  // Until Google OAuth is configured, leave the app open (local dev).
  if (!authConfigured) return;

  const { pathname } = req.nextUrl;
  const isPublic =
    pathname.startsWith("/signin") || pathname.startsWith("/api/auth");
  if (!req.auth && !isPublic) {
    const url = new URL("/signin", req.nextUrl.origin);
    return Response.redirect(url);
  }
});

export const config = {
  // Run on everything except static assets.
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.svg).*)"],
};
