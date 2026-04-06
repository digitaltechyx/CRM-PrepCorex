"use client";

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import {
  addDoc,
  collection,
  doc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
  Timestamp,
} from "firebase/firestore";
import type { Timestamp as TimestampType } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/hooks/use-auth";
import {
  type LeadStatus,
  type PlatformSource,
  type BusinessType,
  type CrmLeadInput,
  type TimelineEntryType,
  defaultFollowUpDaysForStatus,
  addDays,
  LEAD_STATUSES,
} from "@/lib/crm-lead-schema";

const COLLECTION = "crmLeads";

export interface CrmLead {
  id: string;
  leadName: string;
  company?: string;
  email?: string;
  phone?: string;
  platformSource: PlatformSource;
  country?: string;
  businessType?: BusinessType | string;
  status: LeadStatus;
  firstContactAt?: TimestampType | null;
  lastContactAt?: TimestampType | null;
  nextFollowUpAt?: TimestampType | null;
  notes?: string;
  convertedAt?: TimestampType | null;
  monthlyRevenue?: number | null;
  createdByUid?: string;
  createdAt?: TimestampType | null;
  updatedAt?: TimestampType | null;
}

export interface CrmTimelineEntry {
  id: string;
  at: TimestampType | null;
  type: TimelineEntryType;
  text: string;
  byUid?: string;
  fromStatus?: string;
  toStatus?: string;
}


function normalizeStatus(v: unknown): LeadStatus {
  const s = String(v || "");
  return (LEAD_STATUSES as readonly string[]).includes(s) ? (s as LeadStatus) : "new_lead";
}

function normalizeLead(id: string, data: Record<string, unknown>): CrmLead {
  return {
    id,
    leadName: String(data.leadName ?? ""),
    company: data.company != null ? String(data.company) : undefined,
    email: data.email != null ? String(data.email) : undefined,
    phone: data.phone != null ? String(data.phone) : undefined,
    platformSource: (data.platformSource as PlatformSource) || "other",
    country: data.country != null ? String(data.country) : undefined,
    businessType: data.businessType != null ? String(data.businessType) : undefined,
    status: normalizeStatus(data.status),
    firstContactAt: (data.firstContactAt as TimestampType) ?? null,
    lastContactAt: (data.lastContactAt as TimestampType) ?? null,
    nextFollowUpAt: (data.nextFollowUpAt as TimestampType) ?? null,
    notes: data.notes != null ? String(data.notes) : undefined,
    convertedAt: (data.convertedAt as TimestampType) ?? null,
    monthlyRevenue:
      typeof data.monthlyRevenue === "number" ? data.monthlyRevenue : data.monthlyRevenue != null ? Number(data.monthlyRevenue) : null,
    createdByUid: data.createdByUid != null ? String(data.createdByUid) : undefined,
    createdAt: (data.createdAt as TimestampType) ?? null,
    updatedAt: (data.updatedAt as TimestampType) ?? null,
  };
}

export type CrmLeadUpdatePatch = Partial<{
  leadName: string;
  company: string;
  email: string;
  phone: string;
  platformSource: PlatformSource;
  country: string;
  businessType: string;
  notes: string;
  nextFollowUpAt: Date | null;
  monthlyRevenue: number | null;
}>;

type CrmLeadsContextValue = {
  leads: CrmLead[];
  loading: boolean;
  error: string | null;
  createLead: (input: CrmLeadInput) => Promise<string>;
  updateLeadStatus: (
    leadId: string,
    newStatus: LeadStatus,
    userUid: string,
    extra?: { monthlyRevenue?: number | null }
  ) => Promise<void>;
  updateLead: (leadId: string, patch: CrmLeadUpdatePatch) => Promise<void>;
  markClient: (leadId: string, monthlyRevenue?: number | null) => Promise<void>;
  addTimelineNote: (leadId: string, text: string, userUid: string) => Promise<void>;
  subscribeTimeline: (leadId: string | null, cb: (entries: CrmTimelineEntry[]) => void) => () => void;
};

const CrmLeadsContext = createContext<CrmLeadsContextValue | null>(null);

export function CrmLeadsProvider({ children }: { children: React.ReactNode }) {
  const { user, userProfile } = useAuth();
  const [leads, setLeads] = useState<CrmLead[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!user?.uid || !userProfile) {
      setLeads([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    const q = query(collection(db, COLLECTION), orderBy("updatedAt", "desc"));
    const unsub = onSnapshot(
      q,
      (snap) => {
        const list: CrmLead[] = [];
        snap.forEach((d) => list.push(normalizeLead(d.id, d.data() as Record<string, unknown>)));
        setLeads(list);
        setError(null);
        setLoading(false);
      },
      (err) => {
        console.error("[crmLeads]", err);
        setError(err.message || "Failed to load leads");
        setLoading(false);
      }
    );
    return () => unsub();
  }, [user?.uid, userProfile]);

  const appendTimeline = useCallback(
    async (
      leadId: string,
      entry: {
        type: TimelineEntryType;
        text: string;
        byUid: string;
        fromStatus?: LeadStatus;
        toStatus?: LeadStatus;
      }
    ) => {
      await addDoc(collection(db, COLLECTION, leadId, "timeline"), {
        at: serverTimestamp(),
        type: entry.type,
        text: entry.text,
        byUid: entry.byUid,
        ...(entry.fromStatus && { fromStatus: entry.fromStatus }),
        ...(entry.toStatus && { toStatus: entry.toStatus }),
      });
    },
    []
  );

  const computeNextFollowUp = useCallback((status: LeadStatus, from: Date): TimestampType | null => {
    const days = defaultFollowUpDaysForStatus(status);
    if (days == null) return null;
    return Timestamp.fromDate(addDays(from, days));
  }, []);

  const createLead = useCallback(
    async (input: CrmLeadInput): Promise<string> => {
      if (!user?.uid) throw new Error("Not signed in");
      const now = new Date();
      const status: LeadStatus = "new_lead";
      const nextTs = computeNextFollowUp(status, now);
      const ref = await addDoc(collection(db, COLLECTION), {
        leadName: input.leadName.trim(),
        company: input.company?.trim() || "",
        email: input.email?.trim() || "",
        phone: input.phone?.trim() || "",
        platformSource: input.platformSource,
        country: input.country?.trim() || "",
        businessType: input.businessType || "",
        status,
        firstContactAt: serverTimestamp(),
        lastContactAt: serverTimestamp(),
        nextFollowUpAt: nextTs,
        notes: input.notes?.trim() || "",
        createdByUid: user.uid,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      await appendTimeline(ref.id, {
        type: "system",
        text: `Lead created (${input.leadName})`,
        byUid: user.uid,
      });
      if (input.notes?.trim()) {
        await appendTimeline(ref.id, {
          type: "note",
          text: input.notes.trim(),
          byUid: user.uid,
        });
      }
      return ref.id;
    },
    [user?.uid, appendTimeline, computeNextFollowUp]
  );

  const updateLeadStatus = useCallback(
    async (leadId: string, newStatus: LeadStatus, userUid: string, extra?: { monthlyRevenue?: number | null }) => {
      const lead = leads.find((l) => l.id === leadId);
      const prev = lead?.status;
      const now = new Date();
      const nextTs = computeNextFollowUp(newStatus, now);
      const patch: Record<string, unknown> = {
        status: newStatus,
        lastContactAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        nextFollowUpAt: nextTs,
      };
      if (newStatus === "client") {
        patch.convertedAt = serverTimestamp();
        if (extra?.monthlyRevenue != null && extra.monthlyRevenue > 0) {
          patch.monthlyRevenue = extra.monthlyRevenue;
        }
      }
      await updateDoc(doc(db, COLLECTION, leadId), patch);
      if (prev && prev !== newStatus) {
        await appendTimeline(leadId, {
          type: "status_change",
          text: `Status: ${prev} → ${newStatus}`,
          byUid: userUid,
          fromStatus: prev,
          toStatus: newStatus,
        });
      }
    },
    [leads, appendTimeline, computeNextFollowUp]
  );

  const updateLead = useCallback(async (leadId: string, patch: CrmLeadUpdatePatch) => {
    const clean: Record<string, unknown> = { updatedAt: serverTimestamp() };
    if (patch.leadName != null) clean.leadName = patch.leadName;
    if (patch.company != null) clean.company = patch.company;
    if (patch.email != null) clean.email = patch.email;
    if (patch.phone != null) clean.phone = patch.phone;
    if (patch.platformSource != null) clean.platformSource = patch.platformSource;
    if (patch.country != null) clean.country = patch.country;
    if (patch.businessType != null) clean.businessType = patch.businessType;
    if (patch.notes != null) clean.notes = patch.notes;
    if (patch.monthlyRevenue !== undefined) clean.monthlyRevenue = patch.monthlyRevenue;
    if (patch.nextFollowUpAt !== undefined) {
      clean.nextFollowUpAt =
        patch.nextFollowUpAt == null ? null : Timestamp.fromDate(patch.nextFollowUpAt);
    }
    await updateDoc(doc(db, COLLECTION, leadId), clean);
  }, []);

  const markClient = useCallback(
    async (leadId: string, monthlyRevenue?: number | null) => {
      if (!user?.uid) return;
      await updateLeadStatus(leadId, "client", user.uid, { monthlyRevenue: monthlyRevenue ?? undefined });
    },
    [user?.uid, updateLeadStatus]
  );

  const addTimelineNote = useCallback(
    async (leadId: string, text: string, userUid: string) => {
      const t = text.trim();
      if (!t) return;
      await appendTimeline(leadId, { type: "note", text: t, byUid: userUid });
      await updateDoc(doc(db, COLLECTION, leadId), {
        lastContactAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        notes: t,
      });
    },
    [appendTimeline]
  );

  const subscribeTimeline = useCallback((leadId: string | null, cb: (entries: CrmTimelineEntry[]) => void) => {
    if (!leadId) {
      cb([]);
      return () => {};
    }
    const q = query(collection(db, COLLECTION, leadId, "timeline"), orderBy("at", "desc"));
    return onSnapshot(q, (snap) => {
      const entries: CrmTimelineEntry[] = [];
      snap.forEach((d) => {
        const x = d.data() as Record<string, unknown>;
        entries.push({
          id: d.id,
          at: (x.at as TimestampType) ?? null,
          type: (x.type as TimelineEntryType) || "note",
          text: String(x.text ?? ""),
          byUid: x.byUid != null ? String(x.byUid) : undefined,
          fromStatus: x.fromStatus != null ? String(x.fromStatus) : undefined,
          toStatus: x.toStatus != null ? String(x.toStatus) : undefined,
        });
      });
      cb(entries);
    });
  }, []);

  const value = useMemo<CrmLeadsContextValue>(
    () => ({
      leads,
      loading,
      error,
      createLead,
      updateLeadStatus,
      updateLead,
      markClient,
      addTimelineNote,
      subscribeTimeline,
    }),
    [
      leads,
      loading,
      error,
      createLead,
      updateLeadStatus,
      updateLead,
      markClient,
      addTimelineNote,
      subscribeTimeline,
    ]
  );

  return <CrmLeadsContext.Provider value={value}>{children}</CrmLeadsContext.Provider>;
}

export function useCrmLeads() {
  const ctx = useContext(CrmLeadsContext);
  if (!ctx) throw new Error("useCrmLeads must be used within CrmLeadsProvider");
  return ctx;
}

