import { NextRequest, NextResponse } from "next/server";
import { requireMailboxAdmin } from "@/lib/mailbox-auth";
import {
  executeLexiAction,
  type LexiPendingAction,
} from "@/lib/lexi/actions";
import { createLexiMessage } from "@/lib/lexi/messages";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const auth = await requireMailboxAdmin(request);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  try {
    const body = await request.json();
    const action = body?.action as LexiPendingAction | undefined;
    if (!action?.type || !action?.summary) {
      return NextResponse.json(
        { error: "action with type and summary is required" },
        { status: 400 }
      );
    }

    const result = await executeLexiAction({
      type: String(action.type),
      summary: String(action.summary),
      payload:
        action.payload && typeof action.payload === "object"
          ? action.payload
          : {},
    });

    await createLexiMessage({
      type: "general",
      title: `Approved: ${String(action.summary).slice(0, 120)}`,
      body: result.message,
      href: "/dashboard",
      meta: { executedType: action.type, byUid: auth.uid },
    }).catch(() => undefined);

    return NextResponse.json({ success: true, message: result.message });
  } catch (error) {
    console.error("[Lexi execute]", error);
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Failed to execute action",
      },
      { status: 500 }
    );
  }
}
