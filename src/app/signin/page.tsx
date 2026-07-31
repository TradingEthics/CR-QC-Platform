import { redirect } from "next/navigation";
import { ShieldCheck } from "lucide-react";
import { auth, authConfigured, ALLOWED_DOMAIN } from "@/auth";
import { signInGoogle } from "@/app/actions/auth";
import { Button } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function SignInPage() {
  // If already signed in (or auth not configured), go to the app.
  if (!authConfigured) redirect("/dashboard");
  const session = await auth();
  if (session?.user) redirect("/dashboard");

  return (
    <div className="app-canvas grid min-h-screen place-items-center p-6">
      <div className="glass w-full max-w-sm rounded-2xl p-8 text-center">
        <div className="mx-auto grid h-12 w-12 place-items-center rounded-xl bg-[var(--primary)] text-white">
          <ShieldCheck className="h-6 w-6" />
        </div>
        <h1 className="mt-4 text-lg font-semibold">CR QC Platform</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Sign in with your <span className="font-medium">@{ALLOWED_DOMAIN}</span> account
        </p>
        <form action={signInGoogle} className="mt-6">
          <Button className="w-full" type="submit">
            Continue with Google
          </Button>
        </form>
        <p className="mt-4 text-[11px] text-muted-foreground">
          Access is restricted to the FundedNext / NEXT Ventures workspace.
        </p>
      </div>
    </div>
  );
}
