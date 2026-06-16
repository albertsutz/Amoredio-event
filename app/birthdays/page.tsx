import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { readBirthdaysForMonth } from "@/lib/google";
import { MONTH_NAMES, ordinal, buildBirthdayMessage } from "@/lib/birthday";
import type { BirthdayPerson, MonthBirthdays } from "@/lib/types";
import CopyBirthdaysButton from "@/components/CopyBirthdaysButton";
import MonthTabs from "@/components/MonthTabs";

function BirthdayList({
  title,
  people,
  monthName,
}: {
  title: string;
  people: BirthdayPerson[];
  monthName: string;
}) {
  // Group by cell group, preserving sorted order within each group.
  const groups = new Map<string, BirthdayPerson[]>();
  for (const person of people) {
    const key = person.cellGroup || "";
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(person);
  }
  // Sort group keys: named groups alphabetically, empty last.
  const sortedKeys = [...groups.keys()].sort((a, b) => {
    if (!a) return 1;
    if (!b) return -1;
    return a.localeCompare(b);
  });

  return (
    <section>
      <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-400">
        {title}
      </h2>
      {people.length === 0 ? (
        <div className="rounded-xl border border-slate-200 bg-white p-6 text-center text-sm text-slate-500">
          No birthdays in {monthName}.
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          {sortedKeys.map((key) => (
            <div key={key}>
              {key && (
                <p className="mb-1.5 text-xs font-medium text-slate-500">{key}</p>
              )}
              <ul className="divide-y divide-slate-100 overflow-hidden rounded-xl border border-slate-200 bg-white">
                {groups.get(key)!.map((person, i) => (
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
            </div>
          ))}
        </div>
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
  const thisMonth = now.getMonth() + 1; // 1-12
  const nextMonth = thisMonth === 12 ? 1 : thisMonth + 1;
  const thisMonthName = MONTH_NAMES[thisMonth - 1];
  const nextMonthName = MONTH_NAMES[nextMonth - 1];

  let thisData: MonthBirthdays = { newMembers: [], oldMembers: [] };
  let nextData: MonthBirthdays = { newMembers: [], oldMembers: [] };
  let error: string | null = null;
  try {
    [thisData, nextData] = await Promise.all([
      readBirthdaysForMonth(session.accessToken!, thisMonth),
      readBirthdaysForMonth(session.accessToken!, nextMonth),
    ]);
  } catch (err) {
    error = err instanceof Error ? err.message : "Failed to load birthdays";
  }

  return (
    <div className="mx-auto max-w-3xl px-6 py-10">
      <div className="mb-8">
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
          Upcoming Birthdays
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          Members celebrating their birthday this month and next.
        </p>
      </div>

      {error ? (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
          {error}
        </div>
      ) : (
        <MonthTabs
          thisMonthName={thisMonthName}
          nextMonthName={nextMonthName}
          thisMonthContent={
            <div className="flex flex-col gap-8">
              <BirthdayList
                title="New docs"
                people={thisData.newMembers}
                monthName={thisMonthName}
              />
              <BirthdayList
                title="Old docs"
                people={thisData.oldMembers}
                monthName={thisMonthName}
              />
              <div className="flex justify-center border-t border-slate-200 pt-6">
                <CopyBirthdaysButton text={buildBirthdayMessage(thisData, thisMonth)} />
              </div>
            </div>
          }
          nextMonthContent={
            <div className="flex flex-col gap-8">
              <BirthdayList
                title="New docs"
                people={nextData.newMembers}
                monthName={nextMonthName}
              />
              <BirthdayList
                title="Old docs"
                people={nextData.oldMembers}
                monthName={nextMonthName}
              />
              <div className="flex justify-center border-t border-slate-200 pt-6">
                <CopyBirthdaysButton text={buildBirthdayMessage(nextData, nextMonth)} />
              </div>
            </div>
          }
        />
      )}
    </div>
  );
}
