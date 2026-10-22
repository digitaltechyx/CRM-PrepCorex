import { NextRequest, NextResponse } from "next/server";
import { requireMailboxAdmin } from "@/lib/mailbox-auth";
import { getMailboxMessage, markMailboxMessageSeen } from "@/lib/mailbox-imap";

export const dynamic = "force-dynamic";

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const auth = await requireMailboxAdmin(request);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const { id } = await context.params;
  try {
    const message = await getMailboxMessage(decodeURIComponent(id));
    if (!message) {
      return NextResponse.json({ error: "Message not found" }, { status: 404 });
    }
    if (!message.seen) {
      await markMailboxMessageSeen(message.id);
      message.seen = true;
    }
    return NextResponse.json({ message });
  } catch (error) {
    console.error("[Mailbox get]", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to load message" },
      { status: 500 }
    );
  }
}
