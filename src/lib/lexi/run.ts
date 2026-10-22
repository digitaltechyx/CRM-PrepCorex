import { getOpenAiApiKey } from "@/lib/lexi/openai";
import { lexiDraftRepliesForNewInbox } from "@/lib/lexi/email-drafts";
import { lexiLeadBriefing } from "@/lib/lexi/briefing";
import { syncInfoMailbox } from "@/lib/mailbox-imap";
import { processDueScheduledMessages } from "@/lib/mailbox-scheduled";

export async function runLexiAutomation(options?: {
  syncMail?: boolean;
  draftMail?: boolean;
  briefLeads?: boolean;
  draftLimit?: number;
}) {
  if (!getOpenAiApiKey()) {
    throw new Error("OPENAI_API_KEY is not configured on the server.");
  }

  const syncMail = options?.syncMail !== false;
  const draftMail = options?.draftMail !== false;
  const briefLeads = options?.briefLeads !== false;
  const draftLimit = options?.draftLimit ?? 8;

  const scheduled = await processDueScheduledMessages(20).catch((error) => {
    console.warn("[Lexi run] scheduled mail:", error);
    return { processed: 0, sent: 0, failed: 0 };
  });

  let sync = null;
  if (syncMail) {
    sync = await syncInfoMailbox({
      folders: ["inbox", "drafts", "sent", "spam"],
      limit: 40,
    }).catch((error) => ({
      error: error instanceof Error ? error.message : "sync failed",
    }));
  }

  const drafts = draftMail
    ? await lexiDraftRepliesForNewInbox(draftLimit)
    : { scanned: 0, drafted: 0, skipped: 0, errors: [] as string[] };

  const briefing = briefLeads
    ? await lexiLeadBriefing(10)
    : { posted: 0, appreciated: false };

  return {
    success: true as const,
    at: new Date().toISOString(),
    scheduled,
    sync,
    drafts,
    briefing,
  };
}
