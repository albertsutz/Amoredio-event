import MailComposer from "nodemailer/lib/mail-composer";
import type Mail from "nodemailer/lib/mailer";
import type { SendAttachment } from "./types";

/** Replace {name} tokens (and {{name}}) with a recipient's name, falling back to "there". */
export function personalize(template: string, name: string): string {
  const safe = name.trim() || "there";
  return template.replace(/\{\{?\s*name\s*\}?\}/gi, safe);
}

interface InlineImage {
  cid: string;
  content: Buffer;
  contentType: string;
}

/**
 * Pull data-URI <img> sources out of the HTML and turn them into CID references,
 * returning inline attachments. Gmail strips base64 data-URIs, so embedded
 * images must be sent as `cid:` inline parts instead.
 */
export function extractInlineImages(html: string): {
  html: string;
  inline: InlineImage[];
} {
  const inline: InlineImage[] = [];
  let index = 0;

  const out = html.replace(
    /src=["'](data:([^;]+);base64,([^"']+))["']/gi,
    (_match, _full, contentType: string, base64: string) => {
      const cid = `inline-${index++}@amoredio`;
      inline.push({
        cid,
        content: Buffer.from(base64, "base64"),
        contentType,
      });
      return `src="cid:${cid}"`;
    },
  );

  return { html: out, inline };
}

interface BuildMessageParams {
  from: string;
  to: string;
  subject: string;
  html: string;
  attachments: SendAttachment[];
}

/**
 * Compose a full RFC 2822 MIME message and return it base64url-encoded,
 * ready for the Gmail API (`users.messages.send`).
 */
export async function buildRawMessage(params: BuildMessageParams): Promise<string> {
  const { html, inline } = extractInlineImages(params.html);

  const attachments: Mail.Attachment[] = [
    ...inline.map((img) => ({
      cid: img.cid,
      content: img.content,
      contentType: img.contentType,
      contentDisposition: "inline" as const,
      filename: `${img.cid.split("@")[0]}`,
    })),
    ...params.attachments.map((a) => ({
      filename: a.filename,
      content: Buffer.from(a.base64, "base64"),
      contentType: a.contentType,
    })),
  ];

  const composer = new MailComposer({
    from: params.from,
    to: params.to,
    subject: params.subject,
    html,
    attachments,
  });

  const message = await composer.compile().build();
  return message
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}
