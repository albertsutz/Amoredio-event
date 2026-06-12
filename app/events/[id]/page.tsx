import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { getFileName, listEventFiles } from "@/lib/google";
import type { DriveFile } from "@/lib/types";
import EventWorkspace from "@/components/EventWorkspace";

export default async function EventPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await auth();
  if (!session?.user || session.error) {
    redirect("/login");
  }

  const { id } = await params;

  let files: DriveFile[] = [];
  let eventName = "Event";
  let error: string | null = null;
  try {
    [files, eventName] = await Promise.all([
      listEventFiles(session.accessToken!, id),
      getFileName(session.accessToken!, id).then((n) => n ?? "Event"),
    ]);
  } catch (err) {
    error = err instanceof Error ? err.message : "Failed to load event";
  }

  return (
    <div className="mx-auto max-w-3xl px-6 py-10">
      <Link
        href="/"
        className="text-sm text-slate-500 transition hover:text-slate-900"
      >
        ← All events
      </Link>
      <h1 className="mt-2 text-2xl font-semibold tracking-tight text-slate-900">
        {eventName}
      </h1>

      {error ? (
        <div className="mt-6 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
          {error}
        </div>
      ) : (
        <EventWorkspace eventName={eventName} files={files} />
      )}
    </div>
  );
}
