"use client";

import { useEffect, useState } from "react";
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
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import type { CrmLead, CrmTimelineEntry } from "@/contexts/crm-leads-context";
import { useCrmLeads } from "@/contexts/crm-leads-context";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import {
  LEAD_STATUSES,
  STATUS_LABELS,
  PLATFORM_SOURCES,
  PLATFORM_LABELS,
  BUSINESS_TYPES,
  BUSINESS_TYPE_LABELS,
  type LeadStatus,
  type PlatformSource,
} from "@/lib/crm-lead-schema";
import { firestoreTimestampToDate } from "@/lib/crm-date-utils";
import { format } from "date-fns";
import { Loader2 } from "lucide-react";

type Draft = {
  leadName: string;
  company: string;
  email: string;
  phone: string;
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
  const { updateLead, updateLeadStatus, addTimelineNote, subscribeTimeline } = useCrmLeads();
  const [draft, setDraft] = useState<Draft | null>(null);
  const [timeline, setTimeline] = useState<CrmTimelineEntry[]>([]);
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);

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

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="flex w-full flex-col gap-0 overflow-hidden sm:max-w-lg">
        <SheetHeader className="text-left">
          <SheetTitle className="pr-8">{draft.leadName || "Lead"}</SheetTitle>
          <SheetDescription>
            {(draft.company || "No company") + " · " + PLATFORM_LABELS[draft.platformSource]}
          </SheetDescription>
        </SheetHeader>

        <ScrollArea className="flex-1 px-1">
          <div className="space-y-4 pb-8 pr-3">
            <div className="grid gap-2">
              <Label>Status</Label>
              <Select
                value={draft.status}
                onValueChange={(v) => setDraft((d) => (d ? { ...d, status: v as LeadStatus } : d))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {LEAD_STATUSES.map((s) => (
                    <SelectItem key={s} value={s}>
                      {STATUS_LABELS[s]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid gap-2 sm:grid-cols-2">
              <div className="space-y-1">
                <Label htmlFor="ld-name">Name</Label>
                <Input
                  id="ld-name"
                  value={draft.leadName}
                  onChange={(e) => setDraft((d) => (d ? { ...d, leadName: e.target.value } : d))}
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="ld-company">Company</Label>
                <Input
                  id="ld-company"
                  value={draft.company}
                  onChange={(e) => setDraft((d) => (d ? { ...d, company: e.target.value } : d))}
                />
              </div>
            </div>

            <div className="grid gap-2 sm:grid-cols-2">
              <div className="space-y-1">
                <Label htmlFor="ld-email">Email</Label>
                <Input
                  id="ld-email"
                  type="email"
                  value={draft.email}
                  onChange={(e) => setDraft((d) => (d ? { ...d, email: e.target.value } : d))}
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="ld-phone">Phone</Label>
                <Input
                  id="ld-phone"
                  value={draft.phone}
                  onChange={(e) => setDraft((d) => (d ? { ...d, phone: e.target.value } : d))}
                />
              </div>
            </div>

            <div className="grid gap-2 sm:grid-cols-2">
              <div className="space-y-1">
                <Label>Platform</Label>
                <Select
                  value={draft.platformSource}
                  onValueChange={(v) =>
                    setDraft((d) => (d ? { ...d, platformSource: v as PlatformSource } : d))
                  }
                >
                  <SelectTrigger>
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
              <div className="space-y-1">
                <Label htmlFor="ld-country">Country</Label>
                <Input
                  id="ld-country"
                  value={draft.country}
                  onChange={(e) => setDraft((d) => (d ? { ...d, country: e.target.value } : d))}
                />
              </div>
            </div>

            <div className="space-y-1">
              <Label>Business type</Label>
              <Select
                value={draft.businessType}
                onValueChange={(v) => setDraft((d) => (d ? { ...d, businessType: v } : d))}
              >
                <SelectTrigger>
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

            <div className="grid gap-2 sm:grid-cols-2">
              <div className="space-y-1">
                <Label htmlFor="ld-next">Next follow-up</Label>
                <Input
                  id="ld-next"
                  type="date"
                  value={draft.nextFollowUpStr}
                  onChange={(e) =>
                    setDraft((d) => (d ? { ...d, nextFollowUpStr: e.target.value } : d))
                  }
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="ld-rev">Monthly revenue (client)</Label>
                <Input
                  id="ld-rev"
                  inputMode="decimal"
                  placeholder="optional"
                  value={draft.revenueStr}
                  onChange={(e) => setDraft((d) => (d ? { ...d, revenueStr: e.target.value } : d))}
                />
              </div>
            </div>

            <div className="space-y-1">
              <Label htmlFor="ld-notes">Notes (summary)</Label>
              <Textarea
                id="ld-notes"
                rows={2}
                value={draft.notes}
                onChange={(e) => setDraft((d) => (d ? { ...d, notes: e.target.value } : d))}
              />
            </div>

            <Button type="button" size="sm" onClick={saveDetails} disabled={saving}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save changes"}
            </Button>

            <Separator />

            <div className="space-y-2">
              <Label>Conversation timeline</Label>
              <div className="space-y-2 rounded-lg border bg-muted/20 p-3">
                {timeline.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No activity yet.</p>
                ) : (
                  timeline.map((t) => {
                    const at = firestoreTimestampToDate(t.at ?? undefined);
                    return (
                      <div key={t.id} className="border-b border-border/50 pb-2 text-sm last:border-0 last:pb-0">
                        <p className="text-[10px] font-medium uppercase text-muted-foreground">
                          {at ? format(at, "MMM d, yyyy HH:mm") : "—"} · {t.type.replace("_", " ")}
                        </p>
                        <p className="mt-0.5 whitespace-pre-wrap text-foreground">{t.text}</p>
                      </div>
                    );
                  })
                )}
              </div>
              <Textarea
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
        </ScrollArea>
      </SheetContent>
    </Sheet>
  );
}
