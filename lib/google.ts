import { google } from "googleapis";
import type {
  BirthdayPerson,
  DriveFile,
  EventFolder,
  MonthBirthdays,
  ResponsesData,
} from "./types";

const SPREADSHEET_MIME = "application/vnd.google-apps.spreadsheet";
const FOLDER_MIME = "application/vnd.google-apps.folder";

/** Build an OAuth2 client authenticated with the user's access token. */
function oauthClient(accessToken: string) {
  const client = new google.auth.OAuth2();
  client.setCredentials({ access_token: accessToken });
  return client;
}

function driveClient(accessToken: string) {
  return google.drive({ version: "v3", auth: oauthClient(accessToken) });
}

export function gmailClient(accessToken: string) {
  return google.gmail({ version: "v1", auth: oauthClient(accessToken) });
}

/** Send a pre-built, base64url-encoded raw MIME message as the authenticated user. */
export async function sendRawMessage(accessToken: string, raw: string) {
  const gmail = gmailClient(accessToken);
  await gmail.users.messages.send({ userId: "me", requestBody: { raw } });
}

/** Escape a value for use inside a Drive query string literal. */
function escapeQuery(value: string) {
  return value.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
}

/**
 * Resolve the Drive folder ID for the "Events" directory.
 * Prefers EVENTS_FOLDER_ID; otherwise searches by name (EVENTS_FOLDER_NAME, default "Events").
 */
async function resolveEventsFolderId(accessToken: string): Promise<string> {
  if (process.env.EVENTS_FOLDER_ID) return process.env.EVENTS_FOLDER_ID;

  const drive = driveClient(accessToken);
  const name = process.env.EVENTS_FOLDER_NAME || "Events";
  const res = await drive.files.list({
    q: `name = '${escapeQuery(name)}' and mimeType = '${FOLDER_MIME}' and trashed = false`,
    fields: "files(id, name)",
    spaces: "drive",
    pageSize: 10,
  });

  const folder = res.data.files?.[0];
  if (!folder?.id) {
    throw new Error(
      `Could not find a Drive folder named "${name}". Create it or set EVENTS_FOLDER_ID.`,
    );
  }
  return folder.id;
}

/** List the event subfolders inside the Events directory, newest first. */
export async function listEvents(accessToken: string): Promise<EventFolder[]> {
  const drive = driveClient(accessToken);
  const parentId = await resolveEventsFolderId(accessToken);

  const res = await drive.files.list({
    q: `'${parentId}' in parents and mimeType = '${FOLDER_MIME}' and trashed = false`,
    fields: "files(id, name, modifiedTime)",
    orderBy: "name",
    spaces: "drive",
    pageSize: 200,
  });

  return (res.data.files ?? [])
    .map((f) => ({
      id: f.id!,
      name: f.name!,
      modifiedTime: f.modifiedTime ?? undefined,
    }))
    // Drive's orderBy:"name" is byte-ordered (uppercase before lowercase);
    // re-sort locale-aware for a natural A→Z order.
    .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
}

/** Fetch the display name of a Drive file/folder by ID. */
export async function getFileName(
  accessToken: string,
  fileId: string,
): Promise<string | null> {
  const drive = driveClient(accessToken);
  try {
    const res = await drive.files.get({ fileId, fields: "name" });
    return res.data.name ?? null;
  } catch {
    return null;
  }
}

/** List the files inside a single event folder. */
export async function listEventFiles(
  accessToken: string,
  eventId: string,
): Promise<DriveFile[]> {
  const drive = driveClient(accessToken);
  const res = await drive.files.list({
    q: `'${escapeQuery(eventId)}' in parents and mimeType != '${FOLDER_MIME}' and trashed = false`,
    fields: "files(id, name, mimeType)",
    orderBy: "name",
    spaces: "drive",
    pageSize: 200,
  });

  return (res.data.files ?? []).map((f) => ({
    id: f.id!,
    name: f.name!,
    mimeType: f.mimeType!,
    isSpreadsheet: f.mimeType === SPREADSHEET_MIME,
  }));
}

function looksLikeEmail(header: string) {
  return /e-?mail/i.test(header);
}

function looksLikeName(header: string) {
  const h = header.trim().toLowerCase();
  return h === "name" || h === "full name" || /\bname\b/.test(h);
}

/**
 * Read the first sheet of a spreadsheet as form responses.
 * Returns the raw rows plus a best-guess of the name/email columns.
 */
export async function readResponses(
  accessToken: string,
  spreadsheetId: string,
): Promise<ResponsesData> {
  const sheets = google.sheets({ version: "v4", auth: oauthClient(accessToken) });

  const meta = await sheets.spreadsheets.get({ spreadsheetId });
  const firstSheet = meta.data.sheets?.[0]?.properties?.title;
  if (!firstSheet) throw new Error("Spreadsheet has no sheets.");

  const res = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: firstSheet,
    valueRenderOption: "UNFORMATTED_VALUE",
    dateTimeRenderOption: "FORMATTED_STRING",
  });

  const values = (res.data.values ?? []) as unknown[][];
  if (values.length === 0) {
    return { headers: [], rows: [], detected: {} };
  }

  const headers = values[0].map((h) => String(h ?? "").trim());
  const rows = values.slice(1).map((row) => {
    const obj: Record<string, string> = {};
    headers.forEach((header, i) => {
      obj[header] = row[i] == null ? "" : String(row[i]).trim();
    });
    return obj;
  });

  const detected = {
    email: headers.find(looksLikeEmail),
    name: headers.find(looksLikeName),
  };

  return { headers, rows, detected };
}

/** Extract a Google Sheets spreadsheet ID from a full URL, or pass through a raw ID. */
function extractSpreadsheetId(urlOrId: string): string {
  const match = urlOrId.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
  return match ? match[1] : urlOrId.trim();
}

function looksLikeFullName(header: string) {
  const h = header.trim().toLowerCase();
  return h.includes("nama lengkap") || h.includes("full name") || looksLikeName(h);
}

function looksLikeBirthday(header: string) {
  const h = header.trim().toLowerCase();
  return h.includes("ulang tahun") || h.includes("birthday") || h.includes("birth");
}

/**
 * Match the old sheet's full-date "Birthday" column, while avoiding the
 * month-name-only "Birthday Month" column.
 */
function looksLikeBirthdayDate(header: string) {
  const h = header.trim().toLowerCase();
  if (h === "birthday") return true;
  return (
    (h.includes("birthday") ||
      h.includes("ulang tahun") ||
      h.includes("tanggal lahir")) &&
    !h.includes("month")
  );
}

/**
 * Parse a birthday cell written as day/month/year (e.g. "15/06/1990",
 * "15-6-1990", "15.06.90"). Returns null if the day/month can't be read.
 */
function parseDayMonth(raw: string): { day: number; month: number } | null {
  const parts = raw.split(/[^0-9]+/).filter(Boolean);
  if (parts.length < 2) return null;
  const day = Number(parts[0]);
  const month = Number(parts[1]);
  if (!Number.isInteger(day) || !Number.isInteger(month)) return null;
  if (day < 1 || day > 31 || month < 1 || month > 12) return null;
  return { day, month };
}

/**
 * Parse a birthday cell written as day-monthName-year (e.g. "17-Feb-1997",
 * "3 March 1990"). Returns null if the day/month can't be read.
 */
function parseDayMonthName(raw: string): { day: number; month: number } | null {
  const parts = raw.split(/[^A-Za-z0-9]+/).filter(Boolean);
  if (parts.length < 2) return null;
  const day = Number(parts[0]);
  const month = parseMonthName(parts[1]);
  if (!Number.isInteger(day) || day < 1 || day > 31) return null;
  if (month == null) return null;
  return { day, month };
}

const MONTH_LOOKUP: Record<string, number> = {
  january: 1, jan: 1, januari: 1,
  february: 2, feb: 2, februari: 2,
  march: 3, mar: 3, maret: 3,
  april: 4, apr: 4,
  may: 5, mei: 5,
  june: 6, jun: 6, juni: 6,
  july: 7, jul: 7, juli: 7,
  august: 8, aug: 8, agustus: 8,
  september: 9, sep: 9, sept: 9,
  october: 10, oct: 10, oktober: 10,
  november: 11, nov: 11,
  december: 12, dec: 12, desember: 12,
};

/** Parse a month name string ("January", "Mei", "Sep") into a 1-12 number. */
function parseMonthName(raw: string): number | null {
  return MONTH_LOOKUP[raw.trim().toLowerCase()] ?? null;
}

/**
 * Read a sheet's first tab and return {name, raw-birthday} pairs, using the
 * given matcher to locate the birthday column.
 */
async function readBirthdayRows(
  accessToken: string,
  configured: string,
  birthdayMatcher: (header: string) => boolean,
): Promise<{ name: string; raw: string }[]> {
  const spreadsheetId = extractSpreadsheetId(configured);
  const sheets = google.sheets({ version: "v4", auth: oauthClient(accessToken) });

  const meta = await sheets.spreadsheets.get({ spreadsheetId });
  const firstSheet = meta.data.sheets?.[0]?.properties?.title;
  if (!firstSheet) throw new Error("Spreadsheet has no sheets.");

  const res = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: firstSheet,
    valueRenderOption: "UNFORMATTED_VALUE",
    dateTimeRenderOption: "FORMATTED_STRING",
  });

  const values = (res.data.values ?? []) as unknown[][];
  if (values.length === 0) return [];

  const headers = values[0].map((h) => String(h ?? "").trim());
  const nameIdx = headers.findIndex(looksLikeFullName);
  const birthdayIdx = headers.findIndex(birthdayMatcher);

  if (nameIdx === -1 || birthdayIdx === -1) {
    throw new Error(
      `Could not find the name and birthday columns in sheet ${spreadsheetId}.`,
    );
  }

  const rows: { name: string; raw: string }[] = [];
  for (const row of values.slice(1)) {
    const name = String(row[nameIdx] ?? "").trim();
    const raw = String(row[birthdayIdx] ?? "").trim();
    if (!name || !raw) continue;
    rows.push({ name, raw });
  }
  return rows;
}

/**
 * Read the member sheets and return everyone whose birthday falls in the given
 * month (1-12), kept as two separate lists:
 *   - newMembers: BIRTHDAY_SHEET_ID_NEW — full date in "Ulang Tahun/ Birthday"
 *     (day/month/year), sorted by day.
 *   - oldMembers: BIRTHDAY_SHEET_ID_OLD — full date in "Birthday" written as
 *     "17-Feb-1997", sorted by day. Optional (legacy, to be removed later).
 */
export async function readBirthdaysForMonth(
  accessToken: string,
  month: number,
): Promise<MonthBirthdays> {
  const newId = process.env.BIRTHDAY_SHEET_ID_NEW;
  if (!newId) {
    throw new Error(
      "BIRTHDAY_SHEET_ID_NEW is not set. Add the members sheet's URL or ID to your environment.",
    );
  }
  const oldId = process.env.BIRTHDAY_SHEET_ID_OLD;

  const newMembers: BirthdayPerson[] = [];
  const oldMembers: BirthdayPerson[] = [];

  // New sheet — full date, day/month/year.
  const newRows = await readBirthdayRows(accessToken, newId, looksLikeBirthday);
  for (const { name, raw } of newRows) {
    const parsed = parseDayMonth(raw);
    if (!parsed || parsed.month !== month) continue;
    newMembers.push({ name, day: parsed.day, month: parsed.month, raw });
  }
  newMembers.sort((a, b) => (a.day ?? 0) - (b.day ?? 0));

  // Old sheet — full date in "Birthday" (e.g. "17-Feb-1997"). Optional.
  if (oldId) {
    const oldRows = await readBirthdayRows(accessToken, oldId, looksLikeBirthdayDate);
    for (const { name, raw } of oldRows) {
      const parsed = parseDayMonthName(raw);
      if (!parsed || parsed.month !== month) continue;
      oldMembers.push({ name, day: parsed.day, month: parsed.month, raw });
    }
    oldMembers.sort((a, b) => (a.day ?? 0) - (b.day ?? 0));
  }

  return { newMembers, oldMembers };
}
