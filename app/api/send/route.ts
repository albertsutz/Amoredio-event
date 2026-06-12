import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { sendRawMessage } from "@/lib/google";
import { buildRawMessage, personalize } from "@/lib/mime";
import type { SendRequest, SendResult } from "@/lib/types";

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.accessToken || session.error) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await req.json()) as SendRequest;
  const { recipients, subject, html, attachments } = body;

  if (!recipients?.length) {
    return NextResponse.json({ error: "No recipients" }, { status: 400 });
  }
  if (!subject?.trim() || !html?.trim()) {
    return NextResponse.json(
      { error: "Subject and body are required" },
      { status: 400 },
    );
  }

  const fromName = session.user?.name;
  const fromEmail = session.user?.email;
  const from = fromName && fromEmail ? `${fromName} <${fromEmail}>` : fromEmail;

  const result: SendResult = { sent: 0, failed: [] };

  for (const recipient of recipients) {
    const email = recipient.email?.trim();
    if (!email) continue;
    try {
      const raw = await buildRawMessage({
        from: from || email,
        to: email,
        subject: personalize(subject, recipient.name),
        html: personalize(html, recipient.name),
        attachments: attachments ?? [],
      });
      await sendRawMessage(session.accessToken, raw);
      result.sent += 1;
    } catch (err) {
      const message = err instanceof Error ? err.message : "Send failed";
      result.failed.push({ email, error: message });
    }
  }

  return NextResponse.json(result);
}
