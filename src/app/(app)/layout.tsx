import { auth } from "@/auth";
import { Sidebar, Topbar } from "@/components/shell";

export default async function AppLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const session = await auth();
  const user = session?.user
    ? { name: session.user.name ?? null, email: session.user.email ?? null, image: session.user.image ?? null }
    : null;

  return (
    <div className="flex min-h-screen">
      <Sidebar user={user} />
      <div className="app-canvas flex min-h-screen flex-1 flex-col overflow-x-hidden">
        <Topbar />
        <main className="flex-1">{children}</main>
      </div>
    </div>
  );
}
