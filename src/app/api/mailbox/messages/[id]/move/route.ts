import { NextRequest, NextResponse } from "next/server";
import { requireMailboxAdmin } from "@/lib/mailbox-auth";
import { moveMailboxMessage, syncInfoMailbox } from "@/lib/mailbox-imap";
import type { MailboxFolderKey } from "@/lib/mailbox-types";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const auth = await requireMailboxAdmin(request);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const { id } = await context.params;
  try {
    const body = await request.json();
    const targetFolder = String(body?.targetFolder || "") as MailboxFolderKey;
    if (!["inbox", "sent", "drafts", "spam", "trash"].includes(targetFolder)) {
      return NextResponse.json({ error: "Invalid targetFolder" }, { status: 400 });
    }
    const message = await moveMailboxMessage({
      id: decodeURIComponent(id),
      targetFolder,
    });
    await syncInfoMailbox({
      folders: [targetFolder, message.folder],
      limit: 25,
    }).catch(() => undefined);
    return NextResponse.json({ success: true, message });
  } catch (error) {
    console.error("[Mailbox move]", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to move message" },
      { status: 500 }
    );
  }
}
