import { adminDb } from "@/lib/firebase-admin";
import { CRM_LEADS_COLLECTION } from "@/lib/crm/types";
import { createLexiMessage, listLexiMessages } from "@/lib/lexi/messages";
import { lexiChatCompletion } from "@/lib/lexi/openai";
import { LEXI_SYSTEM_PROMPT } from "@/lib/lexi/prompt";
import {
  LEXI_STATE_COLLECTION,
  LEXI_STATE_DOC,
} from "@/lib/lexi/types";

type LeadRow = {
  id: string;
  leadName?: string;
  status?: string;
  nextFollowUpAt?: string;
  email?: string;
  phone?: string;
  company?: string;
};

/**
 * Scan leads and post actionable Lexi messages (deduped by day + lead).
 */
export async function lexiLeadBriefing(limit = 8): Promise<{
  posted: number;
  appreciated: boolean;
}> {
  const snap = await adminDb().collection(CRM_LEADS_COLLECTION).limit(80).get();
  const leads: LeadRow[] = snap.docs.map((d) => ({
    id: d.id,
    ...(d.data() as Omit<LeadRow, "id">),
  }));

  const today = new Date().toISOString().slice(0, 10);
  const stateSnap = await adminDb()
    .collection(LEXI_STATE_COLLECTION)
    .doc(LEXI_STATE_DOC)
    .get();
  const state = (stateSnap.exists ? stateSnap.data() : {}) as {
    leadBriefKeys?: string[];
    lastAppreciationDay?: string;
  };
  const briefKeys = new Set(state.leadBriefKeys || []);

  const actionable = leads
    .filter((l) => {
      const status = String(l.status || "").toLowerCase();
      if (!status) return true;
      if (/won|lost|closed|spam|rejected/i.test(status)) return false;
      return true;
    })
    .slice(0, limit);

  let posted = 0;
  const newKeys = [...briefKeys];

  if (actionable.length) {
    const digest = actionable
      .map(
        (l, i) =>
          `${i + 1}. ${l.leadName || "Lead"} | status=${l.status || "?"} | followUp=${l.nextFollowUpAt || "none"} | ${l.email || l.phone || ""}`
      )
      .join("\n");

    const advice = await lexiChatCompletion({
      messages: [
        {
          role: "system",
          content: `${LEXI_SYSTEM_PROMPT}\n\nWrite a short briefing for the admin (max 180 words). List the top 3–5 actions with lead names. Be encouraging. Plain text only.`,
        },
        {
          role: "user",
          content: `Today is ${today}. Open / active leads:\n${digest}`,
        },
      ],
      temperature: 0.5,
      maxTokens: 500,
    });

    const key = `briefing:${today}`;
    if (!briefKeys.has(key)) {
      await createLexiMessage({
        type: "lead_suggestion",
        title: "Lexi’s lead suggestions for today",
        body: advice,
        href: "/dashboard/leads",
        meta: { day: today, leadCount: actionable.length },
      });
      newKeys.push(key);
      posted += 1;
    }

    for (const lead of actionable.slice(0, 5)) {
      const follow = String(lead.nextFollowUpAt || "");
      const overdue =
        follow && follow.slice(0, 10) <= today && !/won|lost|closed/i.test(String(lead.status || ""));
      const isNew = /new|lead|contact/i.test(String(lead.status || "new"));
      if (!overdue && !isNew) continue;
      const leadKey = `lead:${lead.id}:${today}:${overdue ? "overdue" : "new"}`;
      if (briefKeys.has(leadKey)) continue;
      await createLexiMessage({
        type: "lead_action",
        title: overdue
          ? `Follow up due: ${lead.leadName || "Lead"}`
          : `New lead to contact: ${lead.leadName || "Lead"}`,
        body: overdue
          ? `Please complete today’s follow-up for ${lead.leadName || "this lead"} (${lead.status || "pipeline"}). After you finish, Lexi can help draft the next step and move the pipeline.`
          : `Please reach out to ${lead.leadName || "this lead"}${lead.email ? ` (${lead.email})` : ""}. When you’re done, mark the activity in Leads — Lexi will suggest the next follow-up.`,
        href: "/dashboard/leads",
        meta: { leadId: lead.id, status: lead.status },
      });
      newKeys.push(leadKey);
      posted += 1;
    }
  }

  let appreciated = false;
  if (state.lastAppreciationDay !== today) {
    const recent = await listLexiMessages({ limit: 20 });
    const hasUnreadWork = recent.some((m) => !m.read && m.type !== "appreciation");
    if (!hasUnreadWork && actionable.length > 0) {
      await createLexiMessage({
        type: "appreciation",
        title: "Nice work keeping the pipeline moving",
        body: "You’re staying on top of PrepCorex CRM. If you want ideas on any lead, open Chat with Lexi anytime — I’ve got your back.",
        href: "/dashboard",
      });
      appreciated = true;
      posted += 1;
    }
    await adminDb()
      .collection(LEXI_STATE_COLLECTION)
      .doc(LEXI_STATE_DOC)
      .set(
        {
          leadBriefKeys: newKeys.slice(-200),
          lastAppreciationDay: today,
          lastBriefingAt: new Date().toISOString(),
        },
        { merge: true }
      );
  } else if (posted > 0) {
    await adminDb()
      .collection(LEXI_STATE_COLLECTION)
      .doc(LEXI_STATE_DOC)
      .set(
        {
          leadBriefKeys: newKeys.slice(-200),
          lastBriefingAt: new Date().toISOString(),
        },
        { merge: true }
      );
  }

  return { posted, appreciated };
}
