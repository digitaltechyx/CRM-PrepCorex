import { NextRequest, NextResponse } from "next/server";
import { requireMailboxAdmin } from "@/lib/mailbox-auth";
import {
  setMailboxMessageFlagged,
  setMailboxMessageSeen,
} from "@/lib/mailbox-imap";

export const dynamic = "force-dynamic";

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
    const messageId = decodeURIComponent(id);
    let message;

    if (typeof body?.flagged === "boolean") {
      message = await setMailboxMessageFlagged(messageId, body.flagged);
    } else if (typeof body?.seen === "boolean") {
      message = await setMailboxMessageSeen(messageId, body.seen);
    } else {
      return NextResponse.json(
        { error: "Provide flagged or seen boolean." },
        { status: 400 }
      );
    }

    return NextResponse.json({ success: true, message });
  } catch (error) {
    console.error("[Mailbox flags]", error);
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Failed to update flags",
      },
      { status: 500 }
    );
  }
}
