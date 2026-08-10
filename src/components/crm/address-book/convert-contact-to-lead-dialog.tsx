"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useCrmLeads } from "@/contexts/crm-leads-context";
import { useToast } from "@/hooks/use-toast";
import {
  LEAD_STATUSES,
  STATUS_LABELS,
  type LeadStatus,
  type PlatformSource,
} from "@/lib/crm-lead-schema";
import { getContactMatchKey, type CrmAddressContact, type CrmContactSource } from "@/lib/crm-address-book";
import { Loader2, UserPlus } from "lucide-react";

function mapContactSourceToPlatform(source?: CrmContactSource): PlatformSource {
  switch (source) {
    case "facebook":
      return "facebook";
    case "email":
      return "email";
    case "whatsapp":
      return "whatsapp";
    default:
      return "other";
  }
}

function contactPhone(contact: CrmAddressContact): string {
  return (contact.phone || contact.whatsappId || "").trim();
}

function contactLeadKey(contact: CrmAddressContact): string {
  return getContactMatchKey({
    fullName: contact.fullName,
    email: contact.email,
    phone: contactPhone(contact) || undefined,
  });
}

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  contacts: CrmAddressContact[];
  onConverted?: () => void;
};

export function ConvertContactToLeadDialog({ open, onOpenChange, contacts, onConverted }: Props) {
  const { createLead, leads } = useCrmLeads();
  const { toast } = useToast();
  const [status, setStatus] = useState<LeadStatus>("new_lead");
  const [saving, setSaving] = useState(false);

  const isBulk = contacts.length > 1;
  const single = contacts.length === 1 ? contacts[0] : null;

  const existingLeadKeys = useMemo(() => {
    return new Set(
      leads.map((l) =>
        getContactMatchKey({
          fullName: l.leadName,
          email: l.email,
          phone: l.phone,
        })
      )
    );
  }, [leads]);

  useEffect(() => {
    if (open) setStatus("new_lead");
  }, [open]);

  async function handleConvert() {
    if (contacts.length === 0) return;
    setSaving(true);
    let created = 0;
    let skipped = 0;
    const seen = new Set(existingLeadKeys);
    try {
      for (const contact of contacts) {
        const name = (contact.fullName || "").trim();
        if (!name) {
          skipped += 1;
          continue;
        }
        const key = contactLeadKey(contact);
        if (seen.has(key)) {
          skipped += 1;
          continue;
        }
        await createLead({
          leadName: name,
          company: contact.company?.trim() || undefined,
          email: contact.email?.trim() || undefined,
          phone: contactPhone(contact) || undefined,
          platformSource: mapContactSourceToPlatform(contact.source),
          country: contact.country?.trim() || undefined,
          notes: contact.notes?.trim() || undefined,
          status,
          contactId: contact.id,
        });
        seen.add(key);
        created += 1;
      }

      if (created === 0 && skipped > 0) {
        toast({
          variant: "destructive",
          title: "Already a lead (or missing name)",
          description:
            skipped === 1
              ? "This contact already matches an existing lead, or has no name."
              : "Selected contacts already match existing leads, or are missing names.",
        });
        return;
      }

      toast({
        title: created === 1 ? "Converted to lead" : `${created} contacts converted to leads`,
        description:
          skipped > 0
            ? `${skipped} skipped (already a lead or missing name). Status: ${STATUS_LABELS[status]}.`
            : `Status: ${STATUS_LABELS[status]}. Open Leads to see them.`,
      });
      onOpenChange(false);
      onConverted?.();
    } catch (e) {
      toast({
        variant: "destructive",
        title: "Could not convert to lead",
        description: e instanceof Error ? e.message : "Try again",
      });
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <UserPlus className="h-5 w-5" />
            Convert to lead
          </DialogTitle>
          <DialogDescription>
            {isBulk
              ? `Create ${contacts.length} leads from the selected contacts. Pick the pipeline status they should start in.`
              : single
                ? `Create a lead from ${single.fullName || "this contact"}. Choose the status to place them in.`
                : "Select a contact first."}
          </DialogDescription>
        </DialogHeader>

        {single ? (
          <div className="rounded-lg border bg-muted/30 px-3 py-2 text-sm">
            <p className="font-medium">{single.fullName || "—"}</p>
            <p className="text-muted-foreground">
              {[single.company, single.email, contactPhone(single)].filter(Boolean).join(" · ") || "No extra details"}
            </p>
          </div>
        ) : null}

        <div className="space-y-2">
          <Label htmlFor="convert-lead-status">Lead status</Label>
          <Select value={status} onValueChange={(v) => setStatus(v as LeadStatus)}>
            <SelectTrigger id="convert-lead-status">
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
          <p className="text-xs text-muted-foreground">
            The contact stays in the address book. The new lead appears under this status on the Leads board.
          </p>
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancel
          </Button>
          <Button type="button" onClick={() => void handleConvert()} disabled={saving || contacts.length === 0}>
            {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            {isBulk ? `Convert ${contacts.length}` : "Convert to lead"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
