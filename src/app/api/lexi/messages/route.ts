import { NextRequest, NextResponse } from "next/server";
import { requireMailboxAdmin } from "@/lib/mailbox-auth";
import {
  getLexiUnreadCount,
  listLexiMessages,
  markAllLexiMessagesRead,
} from "@/lib/lexi/messages";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const auth = await requireMailboxAdmin(request);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  try {
    const unreadOnly =
      request.nextUrl.searchParams.get("unreadOnly") === "1" ||
      request.nextUrl.searchParams.get("unreadOnly") === "true";
    const limit = Number(request.nextUrl.searchParams.get("limit") || 40);
    const messages = await listLexiMessages({ limit, unreadOnly });
    const unreadCount = await getLexiUnreadCount();
    return NextResponse.json({ messages, unreadCount });
  } catch (error) {
    console.error("[Lexi messages GET]", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to load Lexi messages" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  const auth = await requireMailboxAdmin(request);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  try {
    const body = await request.json().catch(() => ({}));
    if (body?.action === "mark_all_read") {
      const count = await markAllLexiMessagesRead();
      return NextResponse.json({ success: true, count });
    }
    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed" },
      { status: 500 }
    );
  }
}
