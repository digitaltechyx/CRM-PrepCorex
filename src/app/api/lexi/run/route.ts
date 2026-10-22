import { NextRequest, NextResponse } from "next/server";
import { requireMailboxAdmin } from "@/lib/mailbox-auth";
import { runLexiAutomation } from "@/lib/lexi/run";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Manual Lexi run (admin). Cron uses /api/lexi/cron every 3 hours.
 */
export async function POST(request: NextRequest) {
  const auth = await requireMailboxAdmin(request);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  try {
    const body = await request.json().catch(() => ({}));
    const result = await runLexiAutomation({
      syncMail: body?.syncMail !== false,
      draftMail: body?.draftMail !== false,
      briefLeads: body?.briefLeads !== false,
      draftLimit: 5,
    });
    return NextResponse.json(result);
  } catch (error) {
    console.error("[Lexi run]", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Lexi run failed" },
      { status: 500 }
    );
  }
}
