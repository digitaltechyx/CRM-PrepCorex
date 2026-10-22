import { NextRequest, NextResponse } from "next/server";
import { requireMailboxAdmin } from "@/lib/mailbox-auth";
import {
  getConfiguredMailboxEmail,
  listMailboxMessages,
} from "@/lib/mailbox-imap";
import type { MailboxFolderKey } from "@/lib/mailbox-types";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const auth = await requireMailboxAdmin(request);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const folderParam = String(request.nextUrl.searchParams.get("folder") || "inbox");
  const folder = (
    ["inbox", "sent", "drafts", "spam", "trash"].includes(folderParam)
      ? folderParam
      : "inbox"
  ) as MailboxFolderKey;
  const limit = Number(request.nextUrl.searchParams.get("limit") || 50);

  try {
    const messages = await listMailboxMessages({ folder, limit });
    return NextResponse.json({
      mailboxEmail: getConfiguredMailboxEmail(),
      folder,
      messages,
    });
  } catch (error) {
    console.error("[Mailbox list]", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to list messages" },
      { status: 500 }
    );
  }
}
