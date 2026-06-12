import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { readResponses } from "@/lib/google";

export async function GET(req: Request) {
  const session = await auth();
  if (!session?.accessToken || session.error) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const fileId = new URL(req.url).searchParams.get("fileId");
  if (!fileId) {
    return NextResponse.json({ error: "Missing fileId" }, { status: 400 });
  }

  try {
    const data = await readResponses(session.accessToken, fileId);
    return NextResponse.json(data);
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Failed to read responses";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
