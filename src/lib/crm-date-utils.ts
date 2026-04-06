import type { Timestamp } from "firebase/firestore";

export function firestoreTimestampToDate(t: Timestamp | null | undefined): Date | null {
  if (!t || typeof t.toDate !== "function") return null;
  return t.toDate();
}
