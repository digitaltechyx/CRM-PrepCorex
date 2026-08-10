"use client";

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { doc, onSnapshot, serverTimestamp, setDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/hooks/use-auth";
import {
  CRM_PIPELINE_SETTINGS_DOC,
  CRM_SETTINGS_COLLECTION,
  buildDefaultPipelineStatuses,
  ensureUniqueStatusId,
  followUpDaysForPipelineStatus,
  getPipelineAccent,
  getPipelineStatusLabel,
  mergePipelineConfig,
  nextCustomAccentKey,
  slugifyStatusId,
  visiblePipelineStatuses,
  type PipelineAccentKey,
  type PipelineStatusDef,
  type PipelineStatusKind,
} from "@/lib/crm-pipeline-config";

type CrmPipelineContextValue = {
  statuses: PipelineStatusDef[];
  visibleStatuses: PipelineStatusDef[];
  loading: boolean;
  getLabel: (id: string) => string;
  getAccent: (id: string) => ReturnType<typeof getPipelineAccent>;
  followUpDaysFor: (id: string) => number | null;
  saveStatuses: (statuses: PipelineStatusDef[]) => Promise<void>;
  addCustomStatus: (input: {
    label: string;
    kind?: PipelineStatusKind;
    accentKey?: PipelineAccentKey;
  }) => Promise<PipelineStatusDef>;
  updateStatus: (
    id: string,
    patch: Partial<Pick<PipelineStatusDef, "label" | "hidden" | "kind" | "accentKey" | "followUpDays" | "order">>
  ) => Promise<void>;
  removeCustomStatus: (id: string) => Promise<void>;
  reorderStatuses: (orderedIds: string[]) => Promise<void>;
};

const CrmPipelineContext = createContext<CrmPipelineContextValue | null>(null);

export function CrmPipelineProvider({ children }: { children: React.ReactNode }) {
  const { user, userProfile } = useAuth();
  const [statuses, setStatuses] = useState<PipelineStatusDef[]>(() => buildDefaultPipelineStatuses());
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user?.uid || !userProfile) {
      setStatuses(buildDefaultPipelineStatuses());
      setLoading(false);
      return;
    }

    setLoading(true);
    const ref = doc(db, CRM_SETTINGS_COLLECTION, CRM_PIPELINE_SETTINGS_DOC);
    const unsub = onSnapshot(
      ref,
      (snap) => {
        setStatuses(mergePipelineConfig(snap.exists() ? snap.data() : null));
        setLoading(false);
      },
      (err) => {
        console.error("[crmPipeline]", err);
        setStatuses(buildDefaultPipelineStatuses());
        setLoading(false);
      }
    );
    return () => unsub();
  }, [user?.uid, userProfile]);

  const persist = useCallback(
    async (next: PipelineStatusDef[]) => {
      if (!user?.uid) throw new Error("Not signed in");
      const normalized = next
        .map((s, i) => ({ ...s, order: typeof s.order === "number" ? s.order : i }))
        .sort((a, b) => a.order - b.order);
      setStatuses(normalized);
      await setDoc(
        doc(db, CRM_SETTINGS_COLLECTION, CRM_PIPELINE_SETTINGS_DOC),
        {
          statuses: normalized.map((s) => ({
            id: s.id,
            label: s.label,
            order: s.order,
            kind: s.kind,
            hidden: Boolean(s.hidden),
            isSystem: Boolean(s.isSystem),
            accentKey: s.accentKey || "slate",
            followUpDays: s.followUpDays === undefined ? 2 : s.followUpDays,
          })),
          updatedAt: serverTimestamp(),
          updatedByUid: user.uid,
        },
        { merge: true }
      );
    },
    [user?.uid]
  );

  const saveStatuses = useCallback(
    async (next: PipelineStatusDef[]) => {
      await persist(next);
    },
    [persist]
  );

  const addCustomStatus = useCallback(
    async (input: { label: string; kind?: PipelineStatusKind; accentKey?: PipelineAccentKey }) => {
      const label = input.label.trim();
      if (!label) throw new Error("Status name is required");
      const existing = new Set(statuses.map((s) => s.id));
      const id = ensureUniqueStatusId(slugifyStatusId(label), existing);
      const maxOrder = statuses.reduce((m, s) => Math.max(m, s.order), -1);
      const created: PipelineStatusDef = {
        id,
        label,
        order: maxOrder + 1,
        kind: input.kind ?? "open",
        isSystem: false,
        hidden: false,
        accentKey: input.accentKey ?? nextCustomAccentKey(statuses),
        followUpDays: 2,
      };
      await persist([...statuses, created]);
      return created;
    },
    [persist, statuses]
  );

  const updateStatus = useCallback(
    async (
      id: string,
      patch: Partial<Pick<PipelineStatusDef, "label" | "hidden" | "kind" | "accentKey" | "followUpDays" | "order">>
    ) => {
      const next = statuses.map((s) => {
        if (s.id !== id) return s;
        const kind =
          s.id === "client" ? "won" : s.id === "dead" ? "lost" : patch.kind !== undefined ? patch.kind : s.kind;
        return {
          ...s,
          ...patch,
          kind,
          label: patch.label !== undefined ? patch.label.trim() || s.label : s.label,
        };
      });
      await persist(next);
    },
    [persist, statuses]
  );

  const removeCustomStatus = useCallback(
    async (id: string) => {
      const row = statuses.find((s) => s.id === id);
      if (!row) return;
      if (row.isSystem) throw new Error("Default statuses cannot be deleted. Hide them instead.");
      await persist(statuses.filter((s) => s.id !== id));
    },
    [persist, statuses]
  );

  const reorderStatuses = useCallback(
    async (orderedIds: string[]) => {
      const byId = new Map(statuses.map((s) => [s.id, s]));
      const next: PipelineStatusDef[] = [];
      orderedIds.forEach((id, order) => {
        const row = byId.get(id);
        if (row) {
          next.push({ ...row, order });
          byId.delete(id);
        }
      });
      // Append any missing
      for (const row of byId.values()) {
        next.push({ ...row, order: next.length });
      }
      await persist(next);
    },
    [persist, statuses]
  );

  const value = useMemo<CrmPipelineContextValue>(
    () => ({
      statuses,
      visibleStatuses: visiblePipelineStatuses(statuses),
      loading,
      getLabel: (id) => getPipelineStatusLabel(statuses, id),
      getAccent: (id) => getPipelineAccent(statuses, id),
      followUpDaysFor: (id) => followUpDaysForPipelineStatus(statuses, id),
      saveStatuses,
      addCustomStatus,
      updateStatus,
      removeCustomStatus,
      reorderStatuses,
    }),
    [
      statuses,
      loading,
      saveStatuses,
      addCustomStatus,
      updateStatus,
      removeCustomStatus,
      reorderStatuses,
    ]
  );

  return <CrmPipelineContext.Provider value={value}>{children}</CrmPipelineContext.Provider>;
}

export function useCrmPipeline() {
  const ctx = useContext(CrmPipelineContext);
  if (!ctx) throw new Error("useCrmPipeline must be used within CrmPipelineProvider");
  return ctx;
}
