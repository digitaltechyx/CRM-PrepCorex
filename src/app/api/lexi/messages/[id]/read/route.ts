import { NextRequest, NextResponse } from "next/server";
import { requireMailboxAdmin } from "@/lib/mailbox-auth";
import { markLexiMessageRead } from "@/lib/lexi/messages";

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
    const body = await request.json().catch(() => ({}));
    const read = body?.read !== false;
    const message = await markLexiMessageRead(decodeURIComponent(id), read);
    if (!message) {
      return NextResponse.json({ error: "Message not found" }, { status: 404 });
    }
    return NextResponse.json({ success: true, message });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to update" },
      { status: 500 }
    );
  }
}
