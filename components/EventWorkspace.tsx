"use client";

import { useMemo, useState } from "react";
import EmailEditor from "./EmailEditor";
import { EMAIL_FOOTER_HTML } from "@/lib/emailFooter";
import type {
  DriveFile,
  Recipient,
  ResponsesData,
  SendAttachment,
  SendResult,
} from "@/lib/types";

interface Props {
  eventName: string;
  files: DriveFile[];
}

interface LocalAttachment extends SendAttachment {
  size: number;
}

const MAX_TOTAL_ATTACHMENT_BYTES = 20 * 1024 * 1024; // 20 MB, under Gmail's limit

/** Strip a leading list number like "1." or "2) " from a folder/event name. */
function cleanEventName(name: string): string {
  return name.replace(/^\s*\d+\s*[.)]\s*/, "").trim();
}

function template(kind: "reminder" | "thanks", rawEventName: string) {
  const eventName = cleanEventName(rawEventName);
  if (kind === "reminder") {
    return {
      subject: `Reminder: ${eventName} is coming up`,
      html: `<p>Hai {name}! 👋</p>
<p><strong>${eventName}</strong> — [describe the event here]! 🥳</p>
<p>📅 [date]<br/>⏰ [time]<br/>📍 [location]</p>
<p><strong>Acaranya:</strong><br/>[agenda]</p>
<p>👗 Dress code: [dress code]</p>
<p>Can't wait to see you all there! 🎂🙌</p>
<p>With love,<br/>AmoreDio ✨</p>${EMAIL_FOOTER_HTML}`,
    };
  }
  return {
    subject: `Thank you for joining ${eventName}!`,
    html: `<p>Hello {name}! 👋</p>
<p>We're glad that you came to <strong>${eventName}</strong> 🎉 We hope you found the event valuable and enjoyable.</p>
<p>Please feel free to share any feedback or suggestions, as we are always looking to improve future events.</p>
<p>👉 Share your feedback here: <a href="[feedback form URL]">[feedback form URL]</a></p>
<p>We look forward to seeing you at our next event! 😊</p>
<p>Warm regards,<br/>AmoreDio 💙</p>${EMAIL_FOOTER_HTML}`,
  };
}

function readFileAsBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      resolve(result.split(",")[1] ?? "");
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function isValidEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

export default function EventWorkspace({ eventName, files }: Props) {
  const [selectedFileId, setSelectedFileId] = useState<string | null>(null);
  const [responses, setResponses] = useState<ResponsesData | null>(null);
  const [loadingResponses, setLoadingResponses] = useState(false);
  const [responsesError, setResponsesError] = useState<string | null>(null);

  const [nameCol, setNameCol] = useState<string>("");
  const [emailCol, setEmailCol] = useState<string>("");
  // Emails the user manually removed from the current send.
  const [excluded, setExcluded] = useState<Set<string>>(new Set());

  const [subject, setSubject] = useState("");
  const [html, setHtml] = useState("");
  const [attachments, setAttachments] = useState<LocalAttachment[]>([]);

  const [sending, setSending] = useState(false);
  const [sendResult, setSendResult] = useState<SendResult | null>(null);
  const [sendError, setSendError] = useState<string | null>(null);

  async function loadResponses(fileId: string, { keepColumns = false } = {}) {
    setResponses(null);
    setResponsesError(null);
    setSendResult(null);
    setExcluded(new Set());
    setLoadingResponses(true);
    try {
      const res = await fetch(`/api/responses?fileId=${fileId}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to read responses");
      const parsed = data as ResponsesData;
      setResponses(parsed);
      if (!keepColumns) {
        setNameCol(parsed.detected.name ?? "");
        setEmailCol(parsed.detected.email ?? "");
      }
    } catch (err) {
      setResponsesError(
        err instanceof Error ? err.message : "Failed to read responses",
      );
    } finally {
      setLoadingResponses(false);
    }
  }

  function selectFile(file: DriveFile) {
    setSelectedFileId(file.id);
    loadResponses(file.id);
  }

  // Re-GET the list from the sheet, restoring any removed recipients.
  function resetRecipients() {
    if (selectedFileId) loadResponses(selectedFileId, { keepColumns: true });
  }

  function excludeRecipient(email: string) {
    setExcluded((prev) => new Set(prev).add(email));
  }

  // Full valid/deduped list straight from the sheet, before manual removals.
  const allRecipients = useMemo<Recipient[]>(() => {
    if (!responses || !emailCol) return [];
    const seen = new Set<string>();
    const list: Recipient[] = [];
    for (const row of responses.rows) {
      const email = (row[emailCol] ?? "").trim().toLowerCase();
      if (!isValidEmail(email) || seen.has(email)) continue;
      seen.add(email);
      list.push({ name: nameCol ? (row[nameCol] ?? "").trim() : "", email });
    }
    // Sort by name A→Z (blank names last), falling back to email.
    return list.sort((a, b) => {
      if (!a.name !== !b.name) return a.name ? -1 : 1;
      return (
        a.name.localeCompare(b.name, undefined, { numeric: true }) ||
        a.email.localeCompare(b.email)
      );
    });
  }, [responses, emailCol, nameCol]);

  const recipients = useMemo<Recipient[]>(
    () => allRecipients.filter((r) => !excluded.has(r.email)),
    [allRecipients, excluded],
  );

  const skippedCount =
    responses && emailCol ? responses.rows.length - allRecipients.length : 0;

  const totalAttachmentBytes = attachments.reduce((sum, a) => sum + a.size, 0);
  const attachmentsTooBig = totalAttachmentBytes > MAX_TOTAL_ATTACHMENT_BYTES;

  function applyTemplate(kind: "reminder" | "thanks") {
    const t = template(kind, eventName);
    setSubject(t.subject);
    setHtml(t.html);
  }

  async function addAttachments(fileList: FileList) {
    const next: LocalAttachment[] = [];
    for (const file of Array.from(fileList)) {
      const base64 = await readFileAsBase64(file);
      next.push({
        filename: file.name,
        contentType: file.type || "application/octet-stream",
        base64,
        size: file.size,
      });
    }
    setAttachments((prev) => [...prev, ...next]);
  }

  function removeAttachment(index: number) {
    setAttachments((prev) => prev.filter((_, i) => i !== index));
  }

  async function handleSend() {
    if (!recipients.length) return;
    const ok = window.confirm(
      `Send this email to ${recipients.length} recipient${
        recipients.length === 1 ? "" : "s"
      }?`,
    );
    if (!ok) return;

    setSending(true);
    setSendError(null);
    setSendResult(null);
    try {
      const res = await fetch("/api/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          recipients,
          subject,
          html,
          attachments: attachments.map(({ filename, contentType, base64 }) => ({
            filename,
            contentType,
            base64,
          })),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to send");
      setSendResult(data as SendResult);
    } catch (err) {
      setSendError(err instanceof Error ? err.message : "Failed to send");
    } finally {
      setSending(false);
    }
  }

  const spreadsheets = files.filter((f) => f.isSpreadsheet);
  const canSend =
    recipients.length > 0 &&
    subject.trim().length > 0 &&
    html.replace(/<[^>]*>/g, "").trim().length > 0 &&
    !attachmentsTooBig &&
    !sending;

  return (
    <div className="mt-6 space-y-6">
      {/* Step 1: choose file */}
      <Section step={1} title="Choose the registration responses file">
        {files.length === 0 ? (
          <p className="text-sm text-slate-500">No files in this event folder.</p>
        ) : (
          <div className="space-y-2">
            {files.map((file) => (
              <label
                key={file.id}
                className={`flex cursor-pointer items-center gap-3 rounded-lg border p-3 text-sm transition ${
                  selectedFileId === file.id
                    ? "border-accent bg-rose-50/40"
                    : "border-slate-200 hover:border-slate-300"
                } ${!file.isSpreadsheet ? "opacity-50" : ""}`}
              >
                <input
                  type="radio"
                  name="responses-file"
                  className="accent-accent"
                  disabled={!file.isSpreadsheet}
                  checked={selectedFileId === file.id}
                  onChange={() => selectFile(file)}
                />
                <span className="flex-1 truncate text-slate-800">{file.name}</span>
                {!file.isSpreadsheet && (
                  <span className="text-xs text-slate-400">not a sheet</span>
                )}
              </label>
            ))}
            {spreadsheets.length === 0 && (
              <p className="text-xs text-amber-700">
                No Google Sheets found here. Form responses are usually a Google
                Sheet.
              </p>
            )}
          </div>
        )}
      </Section>

      {/* Step 2: recipients */}
      {selectedFileId && (
        <Section step={2} title="Recipients">
          {loadingResponses ? (
            <p className="text-sm text-slate-500">Reading responses…</p>
          ) : responsesError ? (
            <p className="text-sm text-amber-700">{responsesError}</p>
          ) : responses ? (
            <div className="space-y-4">
              <div className="grid gap-3 sm:grid-cols-2">
                <ColumnPicker
                  label="Email column"
                  value={emailCol}
                  onChange={setEmailCol}
                  headers={responses.headers}
                />
                <ColumnPicker
                  label="Name column"
                  value={nameCol}
                  onChange={setNameCol}
                  headers={responses.headers}
                  allowNone
                />
              </div>

              <div className="flex items-end justify-between gap-3">
                <div className="flex items-baseline gap-2">
                  <span className="text-2xl font-semibold text-slate-900">
                    {recipients.length}
                  </span>
                  <span className="text-sm text-slate-500">
                    recipient{recipients.length === 1 ? "" : "s"}
                    {excluded.size > 0 && ` · ${excluded.size} removed`}
                    {skippedCount > 0 &&
                      ` · ${skippedCount} skipped (blank/invalid/duplicate)`}
                  </span>
                </div>
                <button
                  onClick={resetRecipients}
                  disabled={loadingResponses}
                  title="Re-fetch the list from the sheet and restore removed recipients"
                  className="rounded-md border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600 transition hover:bg-slate-50 hover:text-slate-900 disabled:opacity-50"
                >
                  ↻ Reset list
                </button>
              </div>

              {recipients.length > 0 && (
                <div className="max-h-44 overflow-y-auto rounded-lg border border-slate-200">
                  <table className="w-full text-left text-sm">
                    <tbody>
                      {recipients.slice(0, 200).map((r) => (
                        <tr
                          key={r.email}
                          className="border-b border-slate-100 last:border-0"
                        >
                          <td className="px-3 py-1.5 text-slate-700">
                            {r.name || <span className="text-slate-400">—</span>}
                          </td>
                          <td className="px-3 py-1.5 text-slate-500">{r.email}</td>
                          <td className="w-8 px-2 py-1.5 text-right">
                            <button
                              onClick={() => excludeRecipient(r.email)}
                              title="Remove from this send"
                              className="text-slate-300 transition hover:text-rose-600"
                            >
                              ✕
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          ) : null}
        </Section>
      )}

      {/* Step 3: compose */}
      {recipients.length > 0 && (
        <Section step={3} title="Compose">
          <div className="space-y-4">
            <div className="flex flex-wrap gap-2">
              <TemplateButton onClick={() => applyTemplate("reminder")}>
                Reminder template
              </TemplateButton>
              <TemplateButton onClick={() => applyTemplate("thanks")}>
                Thank-you template
              </TemplateButton>
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">
                Subject
              </label>
              <input
                type="text"
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                placeholder="Subject (you can use {name} here too)"
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-accent"
              />
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">
                Message
              </label>
              <EmailEditor value={html} onChange={setHtml} />
              <p className="mt-1 text-xs text-slate-400">
                Use <code className="rounded bg-slate-100 px-1">{"{name}"}</code>{" "}
                to greet each person by name.
              </p>
            </div>

            <AttachmentList
              attachments={attachments}
              totalBytes={totalAttachmentBytes}
              tooBig={attachmentsTooBig}
              onAdd={addAttachments}
              onRemove={removeAttachment}
            />

            {sendResult ? (
              <SendSummary result={sendResult} />
            ) : sendError ? (
              <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">
                {sendError}
              </p>
            ) : null}

            <div className="flex items-center gap-3 border-t border-slate-200 pt-4">
              <button
                onClick={handleSend}
                disabled={!canSend}
                className="inline-flex items-center gap-2 rounded-lg bg-accent px-5 py-2.5 text-sm font-semibold text-white transition enabled:hover:bg-accent-dark disabled:cursor-not-allowed disabled:opacity-50"
              >
                {sending && (
                  <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" />
                )}
                {sending
                  ? `Sending to ${recipients.length}…`
                  : `Send to ${recipients.length} recipient${
                      recipients.length === 1 ? "" : "s"
                    }`}
              </button>
              {attachmentsTooBig && (
                <span className="text-xs text-amber-700">
                  Attachments exceed 20 MB.
                </span>
              )}
            </div>
          </div>
        </Section>
      )}
    </div>
  );
}

function Section({
  step,
  title,
  children,
}: {
  step: number;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <h2 className="mb-4 flex items-center gap-2 text-sm font-semibold text-slate-900">
        <span className="flex h-6 w-6 items-center justify-center rounded-full bg-slate-900 text-xs text-white">
          {step}
        </span>
        {title}
      </h2>
      {children}
    </section>
  );
}

function ColumnPicker({
  label,
  value,
  onChange,
  headers,
  allowNone,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  headers: string[];
  allowNone?: boolean;
}) {
  return (
    <div>
      <label className="mb-1 block text-xs font-medium text-slate-500">
        {label}
      </label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-accent"
      >
        {allowNone && <option value="">— none —</option>}
        {!allowNone && value === "" && <option value="">Select a column…</option>}
        {headers.map((h) => (
          <option key={h} value={h}>
            {h}
          </option>
        ))}
      </select>
    </div>
  );
}

function TemplateButton({
  onClick,
  children,
}: {
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 transition hover:border-accent hover:text-accent"
    >
      {children}
    </button>
  );
}

function AttachmentList({
  attachments,
  totalBytes,
  tooBig,
  onAdd,
  onRemove,
}: {
  attachments: LocalAttachment[];
  totalBytes: number;
  tooBig: boolean;
  onAdd: (files: FileList) => void;
  onRemove: (index: number) => void;
}) {
  return (
    <div>
      <div className="mb-1 flex items-center justify-between">
        <label className="text-sm font-medium text-slate-700">Attachments</label>
        <label className="cursor-pointer text-xs font-medium text-accent hover:underline">
          + Add files
          <input
            type="file"
            multiple
            className="hidden"
            onChange={(e) => {
              if (e.target.files) onAdd(e.target.files);
              e.target.value = "";
            }}
          />
        </label>
      </div>
      {attachments.length === 0 ? (
        <p className="text-xs text-slate-400">No attachments.</p>
      ) : (
        <ul className="space-y-1.5">
          {attachments.map((a, i) => (
            <li
              key={`${a.filename}-${i}`}
              className="flex items-center justify-between rounded-lg border border-slate-200 px-3 py-2 text-sm"
            >
              <span className="truncate text-slate-700">{a.filename}</span>
              <span className="flex items-center gap-3">
                <span className="text-xs text-slate-400">
                  {formatBytes(a.size)}
                </span>
                <button
                  onClick={() => onRemove(i)}
                  className="text-slate-400 transition hover:text-rose-600"
                  title="Remove"
                >
                  ✕
                </button>
              </span>
            </li>
          ))}
          <li
            className={`pt-1 text-right text-xs ${
              tooBig ? "text-amber-700" : "text-slate-400"
            }`}
          >
            Total {formatBytes(totalBytes)}
          </li>
        </ul>
      )}
    </div>
  );
}

function SendSummary({ result }: { result: SendResult }) {
  return (
    <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-sm">
      <p className="font-medium text-emerald-800">
        Sent to {result.sent} recipient{result.sent === 1 ? "" : "s"}.
      </p>
      {result.failed.length > 0 && (
        <div className="mt-2 text-amber-800">
          <p className="font-medium">{result.failed.length} failed:</p>
          <ul className="mt-1 list-inside list-disc">
            {result.failed.map((f) => (
              <li key={f.email}>
                {f.email} — {f.error}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
