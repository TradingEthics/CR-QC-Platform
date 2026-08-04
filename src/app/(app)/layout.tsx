import { auth } from "@/auth";
import { AppShell } from "@/components/shell";
import { DEFAULT_ROLE } from "@/lib/rbac";

export default async function AppLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const session = await auth();
  const user = session?.user
    ? {
        name: session.user.name ?? null,
        email: session.user.email ?? null,
        image: session.user.image ?? null,
        role: session.user.role ?? DEFAULT_ROLE,
      }
    : null;

  return <AppShell user={user}>{children}</AppShell>;
}
