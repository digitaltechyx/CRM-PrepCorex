import { NextRequest, NextResponse } from "next/server";
import { adminDb, adminFieldValue } from "@/lib/firebase-admin";
import {
  findExistingContact,
  getContactMatchKey,
  mergeSeedIntoContact,
  stripUndefinedFields,
  type AddressBookSeed,
  type CrmAddressContact,
} from "@/lib/crm-address-book";

export const dynamic = "force-dynamic";

const COLLECTION = "crm_contacts";
const B_CARD_SOURCE = "b_card" as const;

type LeadBody = {
  name?: string;
  phone?: string;
  email?: string;
  company?: string;
  notes?: string;
  source?: string;
};

function clean(value: unknown, max = 200): string {
  return String(value ?? "")
    .trim()
    .slice(0, max);
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as LeadBody;
    const fullName = clean(body.name, 120);
    const phone = clean(body.phone, 40);
    const email = clean(body.email, 120).toLowerCase();
    const company = clean(body.company, 120);
    const notesFromForm = clean(body.notes, 500);
    const notes = notesFromForm || "Shared from digital B-Card";

    if (!fullName) {
      return NextResponse.json({ error: "Name is required." }, { status: 400 });
    }
    if (!phone && !email) {
      return NextResponse.json(
        { error: "Phone or email is required." },
        { status: 400 }
      );
    }

    const seed: AddressBookSeed = {
      fullName,
      phone: phone || undefined,
      email: email || undefined,
      company: company || undefined,
      notes,
      source: B_CARD_SOURCE,
    };

    const matchKey = getContactMatchKey(seed);
    const db = adminDb();
    const FieldValue = adminFieldValue();

    // Prefer indexed matchKey lookup; fall back to email/phone scans for older docs.
    let existing: CrmAddressContact | null = null;
    const byKey = await db
      .collection(COLLECTION)
      .where("matchKey", "==", matchKey)
      .limit(1)
      .get();

    if (!byKey.empty) {
      const doc = byKey.docs[0];
      existing = { id: doc.id, ...(doc.data() as Omit<CrmAddressContact, "id">) };
    } else {
      const candidates: CrmAddressContact[] = [];
      if (email) {
        const byEmail = await db
          .collection(COLLECTION)
          .where("email", "==", email)
          .limit(5)
          .get();
        byEmail.docs.forEach((d) => {
          candidates.push({ id: d.id, ...(d.data() as Omit<CrmAddressContact, "id">) });
        });
      }
      if (phone) {
        const byPhone = await db
          .collection(COLLECTION)
          .where("phone", "==", phone)
          .limit(5)
          .get();
        byPhone.docs.forEach((d) => {
          if (!candidates.some((c) => c.id === d.id)) {
            candidates.push({ id: d.id, ...(d.data() as Omit<CrmAddressContact, "id">) });
          }
        });
      }
      existing = findExistingContact(candidates, seed);
    }

    if (existing?.isSpam === true) {
      return NextResponse.json(
        { error: "This contact cannot be saved." },
        { status: 403 }
      );
    }

    const merged = mergeSeedIntoContact(existing, seed);
    // Always tag public card shares as B-Card (even when merging into an older contact).
    merged.source = B_CARD_SOURCE;
    merged.matchKey = matchKey;

    const payload = stripUndefinedFields({
      ...merged,
      updatedAt: FieldValue.serverTimestamp(),
      ...(existing
        ? {}
        : {
            createdAt: FieldValue.serverTimestamp(),
            createdBy: "digital_b_card",
          }),
    });

    if (existing) {
      await db.collection(COLLECTION).doc(existing.id).set(payload, { merge: true });
      return NextResponse.json({ ok: true, id: existing.id, updated: true });
    }

    const ref = await db.collection(COLLECTION).add(payload);
    return NextResponse.json({ ok: true, id: ref.id, updated: false });
  } catch (err: unknown) {
    console.error("[b-card/leads]", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Could not save contact." },
      { status: 500 }
    );
  }
}
