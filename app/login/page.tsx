import { redirect } from "next/navigation";
import { auth } from "@/auth";
import SignInButton from "@/components/SignInButton";

export default async function LoginPage() {
  const session = await auth();
  if (session?.user && !session.error) {
    redirect("/");
  }

  return (
    <div className="mx-auto flex max-w-md flex-col items-center px-6 py-24 text-center">
      <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
        Welcome
      </h1>
      <p className="mt-2 text-sm text-slate-500">
        Sign in with your organization&apos;s Google account to manage event
        emails.
      </p>
      <div className="mt-8">
        <SignInButton />
      </div>
      <p className="mt-6 text-xs text-slate-400">
        We&apos;ll request read access to Drive &amp; Sheets and permission to
        send mail on your behalf.
      </p>
    </div>
  );
}
