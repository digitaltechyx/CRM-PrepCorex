"use client";

import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { useCrmLeads } from "@/contexts/crm-leads-context";
import { useToast } from "@/hooks/use-toast";
import type { PlatformSource } from "@/lib/crm-lead-schema";
import { Upload, Loader2 } from "lucide-react";

function normalizeHeader(h: string) {
  return h.trim().toLowerCase().replace(/\s+/g, "");
}

function mapSource(raw: string): PlatformSource {
  const s = raw.trim().toLowerCase();
  if (s.includes("linkedin")) return "linkedin";
  if (s.includes("amazon")) return "amazon";
  if (s.includes("facebook")) return "facebook";
  if (s.includes("whatsapp")) return "whatsapp";
  if (s.includes("website")) return "website";
  if (s.includes("email")) return "email";
  return "other";
}

/** Export a sheet as CSV from Google Sheets, then upload here. Expected columns: name, email, phone, source, notes (header row). */
export function LeadsCsvImportButton() {
  const inputRef = useRef<HTMLInputElement>(null);
  const { createLead } = useCrmLeads();
  const { toast } = useToast();
  const [busy, setBusy] = useState(false);

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setBusy(true);
    let ok = 0;
    let fail = 0;
    try {
      const text = await file.text();
      const lines = text.split(/\r?\n/).filter((l) => l.trim());
      if (lines.length < 2) {
        toast({ variant: "destructive", title: "CSV needs a header row and at least one data row" });
        return;
      }
      const headers = lines[0].split(",").map((h) => normalizeHeader(h.replace(/^"|"$/g, "")));
      const idx = (name: string) => headers.findIndex((h) => h === name || h.includes(name));
      const iName = idx("name");
      const iEmail = idx("email");
      const iPhone = idx("phone");
      const iSource = idx("source");
      const iNotes = idx("notes");
      if (iName < 0) {
        toast({ variant: "destructive", title: 'Missing "name" column in CSV header' });
        return;
      }
      for (let r = 1; r < lines.length; r++) {
        const cells = lines[r].split(",").map((c) => c.replace(/^"|"$/g, "").trim());
        const name = cells[iName]?.trim();
        if (!name) continue;
        const email = iEmail >= 0 ? cells[iEmail] : "";
        const phone = iPhone >= 0 ? cells[iPhone] : "";
        const sourceRaw = iSource >= 0 ? cells[iSource] : "";
        const notes = iNotes >= 0 ? cells[iNotes] : "";
        try {
          await createLead({
            leadName: name,
            email: email || undefined,
            phone: phone || undefined,
            platformSource: mapSource(sourceRaw),
            notes: notes || undefined,
          });
          ok++;
        } catch {
          fail++;
        }
      }
      toast({
        title: "Import finished",
        description: `${ok} added${fail ? `, ${fail} failed` : ""}`,
      });
    } catch (err) {
      toast({
        variant: "destructive",
        title: "Could not read file",
        description: err instanceof Error ? err.message : "",
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <input ref={inputRef} type="file" accept=".csv,text/csv" className="hidden" onChange={onFile} />
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="gap-1.5 rounded-xl border-border/80 bg-background/80 shadow-sm transition hover:border-primary/30 hover:bg-primary/5 hover:shadow"
        disabled={busy}
        onClick={() => inputRef.current?.click()}
      >
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
        Import CSV
      </Button>
    </>
  );
}
