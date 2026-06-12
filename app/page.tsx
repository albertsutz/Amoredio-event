import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { listEvents } from "@/lib/google";
import type { EventFolder } from "@/lib/types";

function formatDate(iso?: string) {
  if (!iso) return null;
  return new Date(iso).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export default async function HomePage() {
  const session = await auth();
  if (!session?.user || session.error) {
    redirect("/login");
  }

  let events: EventFolder[] = [];
  let error: string | null = null;
  try {
    events = await listEvents(session.accessToken!);
  } catch (err) {
    error = err instanceof Error ? err.message : "Failed to load events";
  }

  return (
    <div className="mx-auto max-w-5xl px-6 py-10">
      <div className="mb-8">
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
          Events
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          Pick an event to email its registered participants.
        </p>
      </div>

      {error ? (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
          {error}
        </div>
      ) : events.length === 0 ? (
        <div className="rounded-lg border border-slate-200 bg-white p-8 text-center text-sm text-slate-500">
          No events found in your Events folder yet.
        </div>
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {events.map((event) => (
            <li key={event.id}>
              <Link
                href={`/events/${event.id}`}
                className="group flex h-full flex-col rounded-xl border border-slate-200 bg-white p-5 shadow-sm transition hover:border-accent hover:shadow-md"
              >
                <span className="text-base font-semibold text-slate-900 group-hover:text-accent">
                  {event.name}
                </span>
                {formatDate(event.modifiedTime) && (
                  <span className="mt-auto pt-4 text-xs text-slate-400">
                    Updated {formatDate(event.modifiedTime)}
                  </span>
                )}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
