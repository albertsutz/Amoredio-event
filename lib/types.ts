export interface EventFolder {
  id: string;
  name: string;
  modifiedTime?: string;
}

export interface DriveFile {
  id: string;
  name: string;
  mimeType: string;
  /** True for Google Sheets / spreadsheet-like files we can read as responses. */
  isSpreadsheet: boolean;
}

export interface ResponsesData {
  headers: string[];
  rows: Record<string, string>[];
  /** Best-guess column names for personalization + sending. */
  detected: {
    name?: string;
    email?: string;
  };
}

export interface BirthdayPerson {
  name: string;
  /** Day of month, 1-31. Undefined when the source only has a birthday month. */
  day?: number;
  /** Month, 1-12. */
  month: number;
  /** The raw birthday cell value, for display fallback. */
  raw: string;
}

export interface MonthBirthdays {
  /** New membership sheet — full dates, sorted by day. */
  newMembers: BirthdayPerson[];
  /** Old (legacy) membership sheet — month only, sorted by name. */
  oldMembers: BirthdayPerson[];
}

export interface Recipient {
  name: string;
  email: string;
}

export interface SendAttachment {
  filename: string;
  contentType: string;
  /** Base64-encoded (not data-URI) file contents. */
  base64: string;
}

export interface SendRequest {
  recipients: Recipient[];
  subject: string;
  /** HTML body. May contain {name} tokens and data-URI <img> tags (inline images). */
  html: string;
  attachments: SendAttachment[];
}

export interface SendResult {
  sent: number;
  failed: { email: string; error: string }[];
}
