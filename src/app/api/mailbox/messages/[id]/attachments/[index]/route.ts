import { NextRequest, NextResponse } from "next/server";
import { requireMailboxAdmin } from "@/lib/mailbox-auth";
import { downloadMailboxAttachment } from "@/lib/mailbox-imap";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string; index: string }> }
) {
  const auth = await requireMailboxAdmin(request);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const { id, index } = await context.params;
  const attIndex = Number(index);
  if (!Number.isFinite(attIndex) || attIndex < 0) {
    return NextResponse.json({ error: "Invalid attachment index" }, { status: 400 });
  }

  try {
    const file = await downloadMailboxAttachment({
      id: decodeURIComponent(id),
      index: attIndex,
    });

    return new NextResponse(new Uint8Array(file.content), {
      status: 200,
      headers: {
        "Content-Type": file.contentType,
        "Content-Disposition": `attachment; filename="${file.filename.replace(/"/g, "")}"`,
        "Cache-Control": "private, max-age=60",
      },
    });
  } catch (error) {
    console.error("[Mailbox attachment]", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Failed to download attachment",
      },
      { status: 500 }
    );
  }
}
