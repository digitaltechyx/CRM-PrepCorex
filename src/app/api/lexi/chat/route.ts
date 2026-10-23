import { NextRequest, NextResponse } from "next/server";
import { requireMailboxAdmin } from "@/lib/mailbox-auth";
import { adminDb } from "@/lib/firebase-admin";
import { lexiChatCompletion } from "@/lib/lexi/openai";
import { LEXI_SYSTEM_PROMPT } from "@/lib/lexi/prompt";
import { LEXI_CHAT_COLLECTION, type LexiChatMessage } from "@/lib/lexi/types";
import { buildCrmSnapshotForLexi } from "@/lib/lexi/crm-snapshot";
import { extractLexiAction } from "@/lib/lexi/actions";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

async function loadRecentChat(uid: string, limit = 20): Promise<LexiChatMessage[]> {
  const snap = await adminDb()
    .collection(LEXI_CHAT_COLLECTION)
    .where("uid", "==", uid)
    .limit(80)
    .get();
  return snap.docs
    .map((d) => ({ ...(d.data() as LexiChatMessage), id: d.id }))
    .sort((a, b) => Number(a.createdAtMs || 0) - Number(b.createdAtMs || 0))
    .slice(-limit);
}

async function saveChat(uid: string, role: "user" | "assistant", content: string) {
  const ref = adminDb().collection(LEXI_CHAT_COLLECTION).doc();
  const now = new Date();
  const doc: LexiChatMessage = {
    id: ref.id,
    uid,
    role,
    content: content.slice(0, 12000),
    createdAt: now.toISOString(),
    createdAtMs: now.getTime(),
  };
  await ref.set(doc);
  return doc;
}

export async function GET(request: NextRequest) {
  const auth = await requireMailboxAdmin(request);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }
  try {
    const messages = await loadRecentChat(auth.uid, 40);
    return NextResponse.json({ messages });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to load chat" },
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
    const body = await request.json();
    const text = String(body?.message || "").trim();
    if (!text) {
      return NextResponse.json({ error: "message is required" }, { status: 400 });
    }

    await saveChat(auth.uid, "user", text);
    const history = await loadRecentChat(auth.uid, 16);
    const snapshot = await buildCrmSnapshotForLexi();

    const rawReply = await lexiChatCompletion({
      messages: [
        { role: "system", content: LEXI_SYSTEM_PROMPT },
        {
          role: "system",
          content: `${snapshot}\n\nAnswer using this snapshot. For totals, prefer TOTAL lines and status counts over listing every name unless the admin asks for a full list.`,
        },
        ...history
          .filter((m) => m.role === "user" || m.role === "assistant")
          .map((m) => ({
            role: m.role as "user" | "assistant",
            content: m.content,
          })),
      ],
      temperature: 0.4,
      maxTokens: 2000,
    });

    const { text: cleanReply, pendingAction } = extractLexiAction(rawReply);
    const assistant = await saveChat(
      auth.uid,
      "assistant",
      cleanReply || rawReply
    );

    return NextResponse.json({
      success: true,
      reply: assistant,
      pendingAction: pendingAction || null,
    });
  } catch (error) {
    console.error("[Lexi chat]", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Lexi chat failed" },
      { status: 500 }
    );
  }
}
