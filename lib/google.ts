import { google } from "googleapis";
import type { DriveFile, EventFolder, ResponsesData } from "./types";

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
