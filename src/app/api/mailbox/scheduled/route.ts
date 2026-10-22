import { NextRequest, NextResponse } from "next/server";
import { requireMailboxAdmin } from "@/lib/mailbox-auth";
import { adminDb } from "@/lib/firebase-admin";
import {
  MAILBOX_SCHEDULED_COLLECTION,
  type CrmMailboxScheduled,
} from "@/lib/mailbox-scheduled";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const auth = await requireMailboxAdmin(request);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  try {
    const snap = await adminDb()
      .collection(MAILBOX_SCHEDULED_COLLECTION)
      .where("status", "==", "pending")
      .orderBy("scheduledForMs", "asc")
      .limit(100)
      .get()
      .catch(async () => {
        const all = await adminDb()
          .collection(MAILBOX_SCHEDULED_COLLECTION)
          .where("status", "==", "pending")
          .limit(100)
          .get();
        return {
          docs: all.docs.sort(
            (a, b) =>
              Number(a.data().scheduledForMs || 0) -
              Number(b.data().scheduledForMs || 0)
          ),
        };
      });

    const messages = snap.docs.map((d) => {
      const data = d.data() as CrmMailboxScheduled;
      return {
        id: data.id,
        to: data.to,
        cc: data.cc,
        subject: data.subject,
        snippet: data.message.replace(/\s+/g, " ").trim().slice(0, 160),
        scheduledFor: data.scheduledFor,
        scheduledForMs: data.scheduledForMs,
        status: data.status,
        createdAt: data.createdAt,
        hasAttachments: Boolean(data.attachments?.length),
      };
    });

    return NextResponse.json({ messages });
  } catch (error) {
    console.error("[Mailbox scheduled list]", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Failed to load scheduled",
      },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest) {
  const auth = await requireMailboxAdmin(request);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");
    if (!id) {
      return NextResponse.json({ error: "id required" }, { status: 400 });
    }
    await adminDb()
      .collection(MAILBOX_SCHEDULED_COLLECTION)
      .doc(id)
      .set({ status: "cancelled" }, { merge: true });
    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Failed to cancel scheduled",
      },
      { status: 500 }
    );
  }
}
