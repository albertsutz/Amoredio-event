import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { readBirthdaysForMonth } from "@/lib/google";
import { MONTH_NAMES, ordinal, buildBirthdayMessage } from "@/lib/birthday";
import type { BirthdayPerson, MonthBirthdays } from "@/lib/types";
import CopyBirthdaysButton from "@/components/CopyBirthdaysButton";

function BirthdayList({
  title,
  people,
  monthName,
}: {
  title: string;
  people: BirthdayPerson[];
  monthName: string;
}) {
  return (
    <section>
      <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-slate-400">
        {title}
      </h2>
      {people.length === 0 ? (
        <div className="rounded-xl border border-slate-200 bg-white p-6 text-center text-sm text-slate-500">
          No birthdays in {monthName}.
        </div>
      ) : (
        <ul className="divide-y divide-slate-100 overflow-hidden rounded-xl border border-slate-200 bg-white">
          {people.map((person, i) => (
            <li
              key={`${person.name}-${i}`}
              className="flex items-center justify-between px-5 py-3.5"
            >
              <span className="text-sm font-medium text-slate-900">
                {person.name}
              </span>
              <span className="text-sm text-slate-500">
                {monthName}
                {person.day != null ? ` ${ordinal(person.day)}` : ""}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

export default async function BirthdaysPage() {
  const session = await auth();
  if (!session?.user || session.error) {
    redirect("/login");
  }

  const now = new Date();
  const month = now.getMonth() + 1; // 1-12
  const monthName = MONTH_NAMES[month - 1];

  let data: MonthBirthdays = { newMembers: [], oldMembers: [] };
  let error: string | null = null;
  try {
    data = await readBirthdaysForMonth(session.accessToken!, month);
  } catch (err) {
    error = err instanceof Error ? err.message : "Failed to load birthdays";
  }

  return (
    <div className="mx-auto max-w-3xl px-6 py-10">
      <div className="mb-8">
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
          Birthdays in {monthName}
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          Members celebrating their birthday this month.
        </p>
      </div>

      {error ? (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
          {error}
        </div>
      ) : (
        <div className="flex flex-col gap-8">
          <BirthdayList
            title="New docs"
            people={data.newMembers}
            monthName={monthName}
          />
          <BirthdayList
            title="Old docs"
            people={data.oldMembers}
            monthName={monthName}
          />

          <div className="flex justify-center border-t border-slate-200 pt-6">
            <CopyBirthdaysButton text={buildBirthdayMessage(data, month)} />
          </div>
        </div>
      )}
    </div>
  );
}
