import Link from "next/link";
import { auth } from "@/auth";
import SignOutButton from "./SignOutButton";
import MainNav from "./MainNav";

export default async function AppHeader() {
  const session = await auth();
  const user = session?.user;

  return (
    <header className="border-b border-slate-200 bg-white">
      <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-3.5">
        <Link href="/" className="flex items-center gap-2">
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-accent text-sm font-bold text-white">
            A
          </span>
          <span className="text-lg font-semibold tracking-tight text-slate-900">
            Amoredio Events
          </span>
        </Link>

        {user ? (
          <div className="flex items-center gap-3">
            <MainNav />
            <span className="hidden text-sm text-slate-500 sm:inline">
              {user.email}
            </span>
            <SignOutButton />
          </div>
        ) : null}
      </div>
    </header>
  );
}
