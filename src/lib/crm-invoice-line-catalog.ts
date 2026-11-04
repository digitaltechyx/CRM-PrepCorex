import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDocs,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
} from "firebase/firestore";
import { db } from "@/lib/firebase";

/** Per-admin saved CRM invoice line templates (full line fields). */
export const CRM_INVOICE_LINE_CATALOG = "crmInvoiceLineCatalog";

export type CrmInvoiceCatalogLine = {
  id: string;
  /** Optional short label in the dropdown; defaults to description. */
  label?: string;
  description: string;
  quantity: number;
  unitPrice: number;
  compareUnitPrice: number;
  createdAt?: unknown;
  updatedAt?: unknown;
};

export function catalogCollectionPath(ownerUid: string) {
  return collection(db, "users", ownerUid, CRM_INVOICE_LINE_CATALOG);
}

export function catalogLineLabel(line: Pick<CrmInvoiceCatalogLine, "label" | "description">): string {
  const label = (line.label || "").trim();
  if (label) return label;
  const desc = (line.description || "").trim();
  if (!desc) return "Untitled line";
  const first = desc.split("\n")[0]?.trim() || desc;
  return first.length > 72 ? `${first.slice(0, 69)}…` : first;
}

function mapCatalogDoc(
  id: string,
  data: Omit<CrmInvoiceCatalogLine, "id">
): CrmInvoiceCatalogLine {
  return {
    id,
    label: typeof data.label === "string" ? data.label : "",
    description: typeof data.description === "string" ? data.description : "",
    quantity: Number(data.quantity) || 0,
    unitPrice: Number(data.unitPrice) || 0,
    compareUnitPrice: Number(data.compareUnitPrice) || 0,
    createdAt: data.createdAt,
    updatedAt: data.updatedAt,
  };
}

export async function listInvoiceCatalogLines(ownerUid: string): Promise<CrmInvoiceCatalogLine[]> {
  const col = catalogCollectionPath(ownerUid);
  try {
    const snap = await getDocs(query(col, orderBy("updatedAt", "desc")));
    return snap.docs.map((d) => mapCatalogDoc(d.id, d.data() as Omit<CrmInvoiceCatalogLine, "id">));
  } catch {
    const snap = await getDocs(col);
    const rows = snap.docs.map((d) =>
      mapCatalogDoc(d.id, d.data() as Omit<CrmInvoiceCatalogLine, "id">)
    );
    return rows.sort((a, b) => catalogLineLabel(a).localeCompare(catalogLineLabel(b)));
  }
}

export type CatalogLineInput = {
  label?: string;
  description: string;
  quantity: number;
  unitPrice: number;
  compareUnitPrice: number;
};

export async function addInvoiceCatalogLine(
  ownerUid: string,
  input: CatalogLineInput
): Promise<string> {
  const ref = await addDoc(catalogCollectionPath(ownerUid), {
    label: (input.label || "").trim(),
    description: (input.description || "").trim(),
    quantity: Number(input.quantity) || 0,
    unitPrice: Number(input.unitPrice) || 0,
    compareUnitPrice: Number(input.compareUnitPrice) || 0,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  return ref.id;
}

export async function updateInvoiceCatalogLine(
  ownerUid: string,
  lineId: string,
  input: CatalogLineInput
): Promise<void> {
  await updateDoc(doc(db, "users", ownerUid, CRM_INVOICE_LINE_CATALOG, lineId), {
    label: (input.label || "").trim(),
    description: (input.description || "").trim(),
    quantity: Number(input.quantity) || 0,
    unitPrice: Number(input.unitPrice) || 0,
    compareUnitPrice: Number(input.compareUnitPrice) || 0,
    updatedAt: serverTimestamp(),
  });
}

export async function deleteInvoiceCatalogLine(ownerUid: string, lineId: string): Promise<void> {
  await deleteDoc(doc(db, "users", ownerUid, CRM_INVOICE_LINE_CATALOG, lineId));
}
