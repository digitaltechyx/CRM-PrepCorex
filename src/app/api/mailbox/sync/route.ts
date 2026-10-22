import { NextRequest, NextResponse } from "next/server";
import { requireMailboxAdmin } from "@/lib/mailbox-auth";
import { syncInfoMailbox } from "@/lib/mailbox-imap";
import type { MailboxFolderKey } from "@/lib/mailbox-types";
import { processDueScheduledMessages } from "@/lib/mailbox-scheduled";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(request: NextRequest) {
  const auth = await requireMailboxAdmin(request);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  try {
    let folders: MailboxFolderKey[] | undefined;
    let limit: number | undefined;
    try {
      const body = await request.json();
      if (Array.isArray(body?.folders)) {
        folders = body.folders.filter((f: string) =>
          ["inbox", "sent", "drafts", "spam", "trash"].includes(f)
        ) as MailboxFolderKey[];
      }
      if (body?.limit) limit = Number(body.limit);
    } catch {
      /* empty body ok */
    }

    const scheduled = await processDueScheduledMessages(15).catch((error) => {
      console.warn("[Mailbox sync] scheduled send:", error);
      return { processed: 0, sent: 0, failed: 0 };
    });

    const result = await syncInfoMailbox({ folders, limit });
    return NextResponse.json({ success: true, ...result, scheduled });
  } catch (error) {
    console.error("[Mailbox sync]", error);
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Mailbox sync failed",
      },
      { status: 500 }
    );
  }
}
