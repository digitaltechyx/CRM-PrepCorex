import { NextRequest, NextResponse } from "next/server";
import { requireMailboxAdmin } from "@/lib/mailbox-auth";
import { adminDb } from "@/lib/firebase-admin";
import { lexiChatCompletion } from "@/lib/lexi/openai";
import { LEXI_SYSTEM_PROMPT } from "@/lib/lexi/prompt";
import { LEXI_CHAT_COLLECTION, type LexiChatMessage } from "@/lib/lexi/types";
import { listLexiMessages } from "@/lib/lexi/messages";
import { CRM_LEADS_COLLECTION } from "@/lib/crm/types";

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

async function buildContextBlock(): Promise<string> {
  const [leadsSnap, unread] = await Promise.all([
    adminDb().collection(CRM_LEADS_COLLECTION).limit(25).get(),
    listLexiMessages({ limit: 8, unreadOnly: true }),
  ]);
  const leads = leadsSnap.docs
    .map((d) => {
      const x = d.data();
      return `- ${x.leadName || d.id} | ${x.status || "?"} | followUp=${x.nextFollowUpAt || "—"}`;
    })
    .join("\n");
  const notes = unread
    .map((m) => `- [${m.type}] ${m.title}`)
    .join("\n");
  return [
    "Live CRM snapshot (may be incomplete):",
    leads ? `Leads sample:\n${leads}` : "Leads: (none loaded)",
    notes ? `Unread Lexi notices for admin:\n${notes}` : "No unread Lexi notices.",
  ].join("\n\n");
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
    const context = await buildContextBlock();

    const reply = await lexiChatCompletion({
      messages: [
        { role: "system", content: LEXI_SYSTEM_PROMPT },
        { role: "system", content: context },
        ...history
          .filter((m) => m.role === "user" || m.role === "assistant")
          .map((m) => ({
            role: m.role as "user" | "assistant",
            content: m.content,
          })),
      ],
      temperature: 0.65,
      maxTokens: 1600,
    });

    const assistant = await saveChat(auth.uid, "assistant", reply);
    return NextResponse.json({ success: true, reply: assistant });
  } catch (error) {
    console.error("[Lexi chat]", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Lexi chat failed" },
      { status: 500 }
    );
  }
}
