import type { BirthdayPerson, MonthBirthdays } from "./types";

export const MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

/** "1st", "2nd", "3rd", "21st", ... */
export function ordinal(day: number): string {
  const rem100 = day % 100;
  if (rem100 >= 11 && rem100 <= 13) return `${day}th`;
  switch (day % 10) {
    case 1:
      return `${day}st`;
    case 2:
      return `${day}nd`;
    case 3:
      return `${day}rd`;
    default:
      return `${day}th`;
  }
}

function birthdayLine(p: BirthdayPerson, monthName: string): string {
  return `• ${p.name} — ${monthName}${p.day != null ? ` ${ordinal(p.day)}` : ""}`;
}

function groupByCG(people: BirthdayPerson[], monthName: string): string {
  const groups = new Map<string, BirthdayPerson[]>();
  for (const p of people) {
    const key = p.cellGroup || "";
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(p);
  }
  const sortedKeys = [...groups.keys()].sort((a, b) => {
    if (!a) return 1;
    if (!b) return -1;
    return a.localeCompare(b);
  });
  return sortedKeys
    .map((key) => {
      const lines = groups.get(key)!.map((p) => birthdayLine(p, monthName));
      return key ? `${key}:\n${lines.join("\n")}` : lines.join("\n");
    })
    .join("\n\n");
}

/** Build the copy-to-clipboard text for a month's birthdays, grouped by CG. */
export function buildBirthdayMessage(
  data: MonthBirthdays,
  month: number,
): string {
  const monthName = MONTH_NAMES[month - 1];
  const { newMembers, oldMembers } = data;

  if (newMembers.length === 0 && oldMembers.length === 0) {
    return "There is no one having birthday at this month.";
  }

  const sections: string[] = [];
  if (newMembers.length > 0) {
    sections.push("New docs:\n" + groupByCG(newMembers, monthName));
  }
  if (oldMembers.length > 0) {
    sections.push("Old docs:\n" + groupByCG(oldMembers, monthName));
  }

  return `🎂 Birthdays in ${monthName} 🎂\n\n${sections.join("\n\n")}`;
}
