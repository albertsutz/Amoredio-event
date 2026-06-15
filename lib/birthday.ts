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

/** Build the copy-to-clipboard text for a month's birthdays, as two lists. */
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
    sections.push(
      "New docs:\n" +
        newMembers.map((p) => birthdayLine(p, monthName)).join("\n"),
    );
  }
  if (oldMembers.length > 0) {
    sections.push(
      "Old docs:\n" +
        oldMembers.map((p) => birthdayLine(p, monthName)).join("\n"),
    );
  }

  return `🎂 Birthdays in ${monthName} 🎂\n\n${sections.join("\n\n")}`;
}
