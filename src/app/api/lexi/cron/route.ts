import { NextRequest, NextResponse } from "next/server";
import { runLexiAutomation } from "@/lib/lexi/run";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

function authorizeCron(request: NextRequest): boolean {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) {
    // Allow only on non-production if secret missing (local smoke).
    return process.env.NODE_ENV !== "production";
  }
  const auth = request.headers.get("authorization") || "";
  if (auth === `Bearer ${secret}`) return true;
  const headerSecret = request.headers.get("x-cron-secret") || "";
  return headerSecret === secret;
}

/**
 * Vercel Cron — every 3 hours.
 * Syncs mailbox, drafts Lexi replies, posts lead briefings.
 */
export async function GET(request: NextRequest) {
  if (!authorizeCron(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const result = await runLexiAutomation({
      syncMail: true,
      draftMail: true,
      briefLeads: true,
      draftLimit: 8,
    });
    console.log("[Lexi cron] ok", {
      drafted: result.drafts.drafted,
      briefing: result.briefing.posted,
    });
    return NextResponse.json(result);
  } catch (error) {
    console.error("[Lexi cron]", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Lexi cron failed" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  return GET(request);
}
