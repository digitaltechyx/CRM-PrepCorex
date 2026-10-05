import { NextRequest, NextResponse } from "next/server";
import { requireCrmAutomation } from "@/lib/crm/crm-automation-auth";
import { addCrmLeadActivity, listCrmLeadActivities } from "@/lib/crm/crm-leads-service";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(request: NextRequest, context: RouteContext) {
  const auth = await requireCrmAutomation(request);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const { id } = await context.params;
  const limit = Number(request.nextUrl.searchParams.get("limit") || "50");

  try {
    const activities = await listCrmLeadActivities(id, limit);
    return NextResponse.json({ leadId: id, activities, count: activities.length });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to load activities.";
    const status = message.includes("not found") ? 404 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}

export async function POST(request: NextRequest, context: RouteContext) {
  const auth = await requireCrmAutomation(request);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const { id } = await context.params;
  let body: {
    type?: string;
    summary?: string;
    text?: string;
    body?: string | null;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  if (!String(body.summary || body.text || body.body || "").trim()) {
    return NextResponse.json({ error: "summary (or text) is required." }, { status: 400 });
  }

  try {
    const activity = await addCrmLeadActivity(id, body, auth.actor);
    return NextResponse.json({ activity }, { status: 201 });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to add activity.";
    const status = message.includes("not found")
      ? 404
      : message.includes("required")
        ? 400
        : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
