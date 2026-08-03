import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
import { getUserRole, DEFAULT_ROLE, type Role } from "@/lib/rbac";

/** Domain allowed to sign in. */
export const ALLOWED_DOMAIN = "nextventures.io";

/** True only when Google OAuth credentials are configured. When absent, the app
 *  runs unprotected (local dev before OAuth is set up). */
export const authConfigured = Boolean(
  process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET
);

export const { handlers, auth, signIn, signOut } = NextAuth({
  secret: process.env.NEXTAUTH_SECRET ?? process.env.AUTH_SECRET,
  trustHost: true,
  providers: authConfigured
    ? [
        Google({
          clientId: process.env.GOOGLE_CLIENT_ID,
          clientSecret: process.env.GOOGLE_CLIENT_SECRET,
          // Ask Google to pre-restrict to the workspace domain.
          authorization: {
            params: { hd: ALLOWED_DOMAIN, prompt: "select_account" },
          },
        }),
      ]
    : [],
  callbacks: {
    // Hard domain check — never trust the client-side hd hint alone.
    signIn({ profile, account }) {
      const email = (profile?.email as string | undefined) ?? "";
      const verified = (profile as { email_verified?: boolean } | undefined)?.email_verified;
      if (account?.provider !== "google") return false;
      return Boolean(verified) && email.toLowerCase().endsWith(`@${ALLOWED_DOMAIN}`);
    },
    // Resolve and cache the RBAC role in the JWT at sign-in. Role changes take
    // effect on the user's next sign-in.
    async jwt({ token, account }) {
      if (account) {
        token.role = await getUserRole(token.email);
      }
      return token;
    },
    session({ session, token }) {
      if (session.user) session.user.role = (token.role as Role | undefined) ?? DEFAULT_ROLE;
      return session;
    },
  },
  pages: { signIn: "/signin" },
});
