"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import type { CrmLead, CrmTimelineEntry } from "@/contexts/crm-leads-context";
import { useCrmLeads } from "@/contexts/crm-leads-context";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import {
  PLATFORM_SOURCES,
  PLATFORM_LABELS,
  BUSINESS_TYPES,
  BUSINESS_TYPE_LABELS,
  type LeadStatus,
  type PlatformSource,
} from "@/lib/crm-lead-schema";
import { useCrmPipeline } from "@/contexts/crm-pipeline-context";
import { firestoreTimestampToDate } from "@/lib/crm-date-utils";
import { format } from "date-fns";
import { Loader2, Pencil, Trash2 } from "lucide-react";

type Draft = {
  leadName: string;
  company: string;
  email: string;
  phone: string;
  url: string;
  platformSource: PlatformSource;
  country: string;
  businessType: string;
  notes: string;
  status: LeadStatus;
  nextFollowUpStr: string;
  revenueStr: string;
};

function leadToDraft(lead: CrmLead): Draft {
  const d = firestoreTimestampToDate(lead.nextFollowUpAt ?? undefined);
  return {
    leadName: lead.leadName,
    company: lead.company ?? "",
    email: lead.email ?? "",
    phone: lead.phone ?? "",
    url: lead.websiteUrl ?? "",
    platformSource: lead.platformSource,
    country: lead.country ?? "",
    businessType: (lead.businessType as string) || "other",
    notes: lead.notes ?? "",
    status: lead.status,
    nextFollowUpStr: d ? format(d, "yyyy-MM-dd") : "",
    revenueStr: lead.monthlyRevenue != null ? String(lead.monthlyRevenue) : "",
  };
}

type Props = {
  lead: CrmLead | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

export function LeadDetailSheet({ lead, open, onOpenChange }: Props) {
  const { user } = useAuth();
  const { toast } = useToast();
  const { updateLead, updateLeadStatus, addTimelineNote, updateTimelineNote, deleteTimelineNote, subscribeTimeline } =
    useCrmLeads();
  const { visibleStatuses, statuses, getLabel } = useCrmPipeline();
  const statusOptions = useMemo(() => {
    const visibleIds = new Set(visibleStatuses.map((s) => s.id));
    const extra =
      lead?.status && !visibleIds.has(lead.status)
        ? statuses.filter((s) => s.id === lead.status)
        : [];
    return [...visibleStatuses, ...extra];
  }, [visibleStatuses, statuses, lead?.status]);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [timeline, setTimeline] = useState<CrmTimelineEntry[]>([]);
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [editingEntryId, setEditingEntryId] = useState<string | null>(null);
  const [editingEntryText, setEditingEntryText] = useState("");
  const [deletingEntryId, setDeletingEntryId] = useState<string | null>(null);

  useEffect(() => {
    if (lead && open) {
      setDraft(leadToDraft(lead));
      setNote("");
    } else {
      setDraft(null);
    }
  }, [lead?.id, open, lead]);

  useEffect(() => {
    if (!lead?.id || !open) {
      setTimeline([]);
      return;
    }
    const unsub = subscribeTimeline(lead.id, setTimeline);
    return () => unsub();
  }, [lead?.id, open, subscribeTimeline]);

  if (!lead || !draft) return null;

  async function saveDetails() {
    if (!user?.uid) return;
    setSaving(true);
    try {
      let next: Date | null = null;
      if (draft.nextFollowUpStr.trim()) {
        const [y, m, d] = draft.nextFollowUpStr.split("-").map(Number);
        if (y && m && d) next = new Date(y, m - 1, d, 9, 0, 0);
      }
      const rev = draft.revenueStr.trim() ? Number(draft.revenueStr.replace(/,/g, "")) : null;
      if (draft.status !== lead.status) {
        await updateLeadStatus(lead.id, draft.status, user.uid, {
          monthlyRevenue: rev != null && !Number.isNaN(rev) && rev > 0 ? rev : undefined,
        });
      }
      await updateLead(lead.id, {
        leadName: draft.leadName.trim(),
        company: draft.company.trim(),
        email: draft.email.trim(),
        phone: draft.phone.trim(),
        websiteUrl: draft.url.trim(),
        platformSource: draft.platformSource,
        country: draft.country.trim(),
        businessType: draft.businessType,
        notes: draft.notes.trim(),
        nextFollowUpAt: next,
        monthlyRevenue: rev != null && !Number.isNaN(rev) ? rev : null,
      });
      toast({ title: "Saved" });
    } catch (e) {
      toast({
        variant: "destructive",
        title: "Save failed",
        description: e instanceof Error ? e.message : "",
      });
    } finally {
      setSaving(false);
    }
  }

  async function addNote() {
    if (!user?.uid || !note.trim()) return;
    setSaving(true);
    try {
      await addTimelineNote(lead.id, note, user.uid);
      setNote("");
      toast({ title: "Note added" });
    } catch (e) {
      toast({ variant: "destructive", title: "Failed", description: String(e) });
    } finally {
      setSaving(false);
    }
  }

  /** Any CRM user may edit/delete notes (Firestore already limits to admin/sub-admin). */
  function canEditTimelineNote(t: CrmTimelineEntry) {
    return t.type === "note" && !!user?.uid;
  }

  async function saveEditedNote() {
    if (!editingEntryId || !editingEntryText.trim()) return;
    setSaving(true);
    try {
      await updateTimelineNote(lead.id, editingEntryId, editingEntryText);
      setEditingEntryId(null);
      setEditingEntryText("");
      toast({ title: "Note updated" });
    } catch (e) {
      toast({ variant: "destructive", title: "Update failed", description: String(e) });
    } finally {
      setSaving(false);
    }
  }

  async function confirmDeleteNote() {
    if (!deletingEntryId) return;
    setSaving(true);
    try {
      await deleteTimelineNote(lead.id, deletingEntryId);
      setDeletingEntryId(null);
      if (editingEntryId === deletingEntryId) {
        setEditingEntryId(null);
        setEditingEntryText("");
      }
      toast({ title: "Note deleted" });
    } catch (e) {
      toast({ variant: "destructive", title: "Delete failed", description: String(e) });
    } finally {
      setSaving(false);
    }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="flex h-full max-h-dvh w-full min-w-0 flex-col gap-0 overflow-hidden p-6 sm:max-w-xl">
        <SheetHeader className="shrink-0 space-y-1 pr-10 text-left">
          <SheetTitle className="pr-2">{draft.leadName || "Lead"}</SheetTitle>
          <SheetDescription>
            {(draft.company || "No company") + " · " + PLATFORM_LABELS[draft.platformSource]}
          </SheetDescription>
        </SheetHeader>

        <div className="min-h-0 min-w-0 flex-1 overflow-x-hidden overflow-y-auto overscroll-contain [-webkit-overflow-scrolling:touch]">
          <div className="min-w-0 space-y-4 pb-6 pr-1 pt-1">
            <div className="grid min-w-0 gap-2">
              <Label>Status</Label>
              <Select
                value={draft.status}
                onValueChange={(v) => setDraft((d) => (d ? { ...d, status: v as LeadStatus } : d))}
              >
                <SelectTrigger className="min-w-0">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {statusOptions.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {getLabel(s.id)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="min-w-0 space-y-1">
                <Label htmlFor="ld-name">Name</Label>
                <Input
                  id="ld-name"
                  className="min-w-0"
                  value={draft.leadName}
                  onChange={(e) => setDraft((d) => (d ? { ...d, leadName: e.target.value } : d))}
                />
              </div>
              <div className="min-w-0 space-y-1">
                <Label htmlFor="ld-company">Company</Label>
                <Input
                  id="ld-company"
                  className="min-w-0"
                  value={draft.company}
                  onChange={(e) => setDraft((d) => (d ? { ...d, company: e.target.value } : d))}
                />
              </div>
            </div>

            <div className="grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="min-w-0 space-y-1">
                <Label htmlFor="ld-email">Email</Label>
                <Input
                  id="ld-email"
                  className="min-w-0"
                  type="email"
                  value={draft.email}
                  onChange={(e) => setDraft((d) => (d ? { ...d, email: e.target.value } : d))}
                />
              </div>
              <div className="min-w-0 space-y-1">
                <Label htmlFor="ld-phone">Phone</Label>
                <Input
                  id="ld-phone"
                  className="min-w-0"
                  value={draft.phone}
                  onChange={(e) => setDraft((d) => (d ? { ...d, phone: e.target.value } : d))}
                />
              </div>
            </div>

            <div className="min-w-0 space-y-1">
              <Label htmlFor="ld-url">Website / URL</Label>
              <Textarea
                id="ld-url"
                rows={2}
                spellCheck={false}
                inputMode="url"
                autoComplete="url"
                placeholder="https://…"
                className="min-h-[2.75rem] min-w-0 resize-y font-mono text-[13px] leading-snug break-all"
                value={draft.url}
                onChange={(e) => setDraft((d) => (d ? { ...d, url: e.target.value } : d))}
              />
              <p className="text-[11px] text-muted-foreground">Long links wrap inside this box.</p>
            </div>

            <div className="grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="min-w-0 space-y-1">
                <Label>Platform</Label>
                <Select
                  value={draft.platformSource}
                  onValueChange={(v) =>
                    setDraft((d) => (d ? { ...d, platformSource: v as PlatformSource } : d))
                  }
                >
                  <SelectTrigger className="min-w-0">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {PLATFORM_SOURCES.map((p) => (
                      <SelectItem key={p} value={p}>
                        {PLATFORM_LABELS[p]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="min-w-0 space-y-1">
                <Label htmlFor="ld-country">Country</Label>
                <Input
                  id="ld-country"
                  className="min-w-0"
                  value={draft.country}
                  onChange={(e) => setDraft((d) => (d ? { ...d, country: e.target.value } : d))}
                />
              </div>
            </div>

            <div className="min-w-0 space-y-1">
              <Label>Business type</Label>
              <Select
                value={draft.businessType}
                onValueChange={(v) => setDraft((d) => (d ? { ...d, businessType: v } : d))}
              >
                <SelectTrigger className="min-w-0">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {BUSINESS_TYPES.map((b) => (
                    <SelectItem key={b} value={b}>
                      {BUSINESS_TYPE_LABELS[b]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="min-w-0 space-y-1">
                <Label htmlFor="ld-next">Next follow-up</Label>
                <Input
                  id="ld-next"
                  className="min-w-0"
                  type="date"
                  value={draft.nextFollowUpStr}
                  onChange={(e) =>
                    setDraft((d) => (d ? { ...d, nextFollowUpStr: e.target.value } : d))
                  }
                />
              </div>
              <div className="min-w-0 space-y-1">
                <Label htmlFor="ld-rev" className="leading-snug" title="Monthly revenue when marked as client">
                  Monthly revenue
                </Label>
                <p className="text-[11px] text-muted-foreground">Optional · for clients</p>
                <Input
                  id="ld-rev"
                  className="min-w-0"
                  inputMode="decimal"
                  placeholder="e.g. 5000"
                  value={draft.revenueStr}
                  onChange={(e) => setDraft((d) => (d ? { ...d, revenueStr: e.target.value } : d))}
                />
              </div>
            </div>

            <div className="min-w-0 space-y-1">
              <Label htmlFor="ld-notes">Notes (summary)</Label>
              <Textarea
                id="ld-notes"
                className="min-w-0 resize-y break-words [overflow-wrap:anywhere]"
                rows={2}
                value={draft.notes}
                onChange={(e) => setDraft((d) => (d ? { ...d, notes: e.target.value } : d))}
              />
            </div>

            <Button type="button" size="sm" onClick={saveDetails} disabled={saving}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save changes"}
            </Button>

            <Separator />

            <div className="min-w-0 space-y-2">
              <Label>Conversation timeline</Label>
              <div className="min-w-0 max-w-full space-y-2 overflow-hidden rounded-lg border bg-muted/20 p-3">
                {timeline.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No activity yet.</p>
                ) : (
                  timeline.map((t) => {
                    const at = firestoreTimestampToDate(t.at ?? undefined);
                    const editable = canEditTimelineNote(t);
                    const isEditing = editingEntryId === t.id;
                    return (
                      <div
                        key={t.id}
                        className="min-w-0 max-w-full border-b border-border/50 pb-3 text-sm last:border-0 last:pb-0"
                      >
                        <div className="flex min-w-0 items-start justify-between gap-2">
                          <p className="min-w-0 flex-1 text-[10px] font-medium uppercase text-muted-foreground">
                            {at ? format(at, "MMM d, yyyy HH:mm") : "—"} · {t.type.replace("_", " ")}
                          </p>
                          {editable && !isEditing ? (
                            <div className="flex shrink-0 gap-0.5">
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8 text-muted-foreground hover:text-foreground"
                                aria-label="Edit note"
                                onClick={() => {
                                  setEditingEntryId(t.id);
                                  setEditingEntryText(t.text);
                                }}
                              >
                                <Pencil className="h-3.5 w-3.5" />
                              </Button>
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8 text-muted-foreground hover:text-destructive"
                                aria-label="Delete note"
                                onClick={() => setDeletingEntryId(t.id)}
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            </div>
                          ) : null}
                        </div>
                        {isEditing ? (
                          <div className="mt-2 space-y-2">
                            <Textarea
                              className="min-h-[72px] min-w-0 resize-y text-sm break-words [overflow-wrap:anywhere]"
                              value={editingEntryText}
                              onChange={(e) => setEditingEntryText(e.target.value)}
                            />
                            <div className="flex flex-wrap gap-2">
                              <Button
                                type="button"
                                size="sm"
                                disabled={saving || !editingEntryText.trim()}
                                onClick={saveEditedNote}
                              >
                                Save
                              </Button>
                              <Button
                                type="button"
                                size="sm"
                                variant="outline"
                                disabled={saving}
                                onClick={() => {
                                  setEditingEntryId(null);
                                  setEditingEntryText("");
                                }}
                              >
                                Cancel
                              </Button>
                            </div>
                          </div>
                        ) : (
                          <p className="mt-0.5 min-w-0 max-w-full whitespace-pre-wrap break-words [overflow-wrap:anywhere] text-foreground [word-break:break-word]">
                            {t.text}
                          </p>
                        )}
                      </div>
                    );
                  })
                )}
              </div>
              <Textarea
                className="min-w-0 resize-y break-words [overflow-wrap:anywhere]"
                placeholder="Add a note (e.g. Sent LinkedIn message…)"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                rows={3}
              />
              <Button type="button" size="sm" variant="secondary" onClick={addNote} disabled={saving || !note.trim()}>
                Add note
              </Button>
            </div>
          </div>
        </div>

        <AlertDialog open={!!deletingEntryId} onOpenChange={(o) => !o && setDeletingEntryId(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete this note?</AlertDialogTitle>
              <AlertDialogDescription>
                This removes the note from the timeline. Status changes and system events are not affected.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={saving}>Cancel</AlertDialogCancel>
              <Button
                type="button"
                variant="destructive"
                disabled={saving}
                onClick={() => void confirmDeleteNote()}
              >
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Delete"}
              </Button>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </SheetContent>
    </Sheet>
  );
}
