"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  collection,
  doc,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
  writeBatch,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/hooks/use-auth";
import { useCollection } from "@/hooks/use-collection";
import { useToast } from "@/hooks/use-toast";
import {
  buildCrmInvoiceFillPayload,
  isCopiedSyncDoc,
  PREPCOREX_INVOICE_SYNC_COLLECTION,
  CRM_INVOICE_FILL_STORAGE_KEY,
  type PrepcorexInvoiceSyncDoc,
} from "@/lib/prepcorex-invoice-sync";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { Copy, Filter, Loader2, Receipt } from "lucide-react";

function formatMoney(n: unknown): string {
  const v = Number(n);
  if (!Number.isFinite(v)) return "$0.00";
  return `$${v.toFixed(2)}`;
}

function formatDate(value?: string | null): string {
  if (!value) return "—";
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(value).trim());
  if (!m) return String(value);
  return `${m[2]}/${m[3]}/${m[1]}`;
}

export function InvoiceSyncPortal() {
  const { user } = useAuth();
  const { toast } = useToast();
  const router = useRouter();

  const syncQuery = useMemo(
    () =>
      query(
        collection(db, PREPCOREX_INVOICE_SYNC_COLLECTION),
        orderBy("syncedAt", "desc")
      ),
    []
  );
  const { data: rows, loading } = useCollection<PrepcorexInvoiceSyncDoc>(
    PREPCOREX_INVOICE_SYNC_COLLECTION,
    syncQuery
  );

  const [search, setSearch] = useState("");
  const [copiedFilter, setCopiedFilter] = useState<"all" | "copied" | "not_copied">("all");
  const [statusFilter, setStatusFilter] = useState<"all" | "pending" | "paid">("all");
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [filling, setFilling] = useState(false);

  const typeOptions = useMemo(() => {
    const set = new Set<string>();
    for (const row of rows) {
      const t = String(row.type || "").trim();
      if (t) set.add(t);
    }
    return [...set].sort();
  }, [rows]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((row) => {
      const copied = isCopiedSyncDoc(row);
      if (copiedFilter === "copied" && !copied) return false;
      if (copiedFilter === "not_copied" && copied) return false;

      const status = String(row.status || "").toLowerCase();
      if (statusFilter !== "all" && status !== statusFilter) return false;

      if (typeFilter !== "all" && String(row.type || "") !== typeFilter) return false;

      const invDate = String(row.invoiceDate || "").slice(0, 10);
      if (dateFrom && invDate && invDate < dateFrom) return false;
      if (dateTo && invDate && invDate > dateTo) return false;

      if (!q) return true;
      const hay = [
        row.invoiceNumber,
        row.clientName,
        row.clientEmail,
        row.sourceInvoiceId,
        row.type,
      ]
        .map((x) => String(x || "").toLowerCase())
        .join(" ");
      return hay.includes(q);
    });
  }, [rows, search, copiedFilter, statusFilter, typeFilter, dateFrom, dateTo]);

  const selectedDocs = useMemo(
    () => filtered.filter((row) => selected[row.id]),
    [filtered, selected]
  );

  const allFilteredSelected =
    filtered.length > 0 && filtered.every((row) => selected[row.id]);

  function toggleAllFiltered(next: boolean) {
    setSelected((prev) => {
      const copy = { ...prev };
      for (const row of filtered) {
        copy[row.id] = next;
      }
      return copy;
    });
  }

  async function handleFillTemplate() {
    if (!user) {
      toast({
        variant: "destructive",
        title: "Sign in required",
        description: "Sign in again to fill the invoice template.",
      });
      return;
    }
    if (selectedDocs.length === 0) {
      toast({
        variant: "destructive",
        title: "No invoices selected",
        description: "Select one or more synced invoices first.",
      });
      return;
    }

    const clientKeys = new Set(
      selectedDocs.map((d) =>
        `${String(d.clientEmail || "").trim().toLowerCase()}|${String(d.clientName || "").trim().toLowerCase()}`
      )
    );
    if (clientKeys.size > 1) {
      toast({
        variant: "destructive",
        title: "Different clients selected",
        description:
          "Select invoices for the same client so they can fill one template together.",
      });
      return;
    }

    setFilling(true);
    try {
      const payload = buildCrmInvoiceFillPayload(selectedDocs);
      sessionStorage.setItem(CRM_INVOICE_FILL_STORAGE_KEY, JSON.stringify(payload));

      const batch = writeBatch(db);
      const stamp = {
        copiedAt: serverTimestamp(),
        copiedByUid: user.uid,
        copiedByEmail: user.email || null,
      };
      for (const row of selectedDocs) {
        const ref = doc(db, PREPCOREX_INVOICE_SYNC_COLLECTION, row.id);
        batch.update(ref, {
          ...stamp,
          copyCount: Math.max(0, Number(row.copyCount) || 0) + 1,
        });
      }
      await batch.commit();

      toast({
        title: "Template ready",
        description: `${selectedDocs.length} invoice(s) merged into Invoice management.`,
      });
      setSelected({});
      router.push("/dashboard/invoice-portal?fill=1");
    } catch (error: unknown) {
      toast({
        variant: "destructive",
        title: "Could not fill template",
        description: error instanceof Error ? error.message : "Try again.",
      });
    } finally {
      setFilling(false);
    }
  }

  async function markNotCopied(row: PrepcorexInvoiceSyncDoc) {
    try {
      await updateDoc(doc(db, PREPCOREX_INVOICE_SYNC_COLLECTION, row.id), {
        copiedAt: null,
        copiedByUid: null,
        copiedByEmail: null,
      });
      toast({ title: "Copied badge cleared" });
    } catch (error: unknown) {
      toast({
        variant: "destructive",
        title: "Update failed",
        description: error instanceof Error ? error.message : "Try again.",
      });
    }
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-lg">
            <Receipt className="h-5 w-5" />
            PrepCorex invoice sync
          </CardTitle>
          <CardDescription>
            Select one or more synced PrepCorex invoices. Their line items merge into the
            existing Invoice management template. Copied invoices show a badge.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
            <div className="space-y-1.5 xl:col-span-2">
              <Label htmlFor="inv-sync-search">Search</Label>
              <Input
                id="inv-sync-search"
                placeholder="Invoice #, client, email…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Copied</Label>
              <Select
                value={copiedFilter}
                onValueChange={(v) => setCopiedFilter(v as typeof copiedFilter)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All</SelectItem>
                  <SelectItem value="not_copied">Not copied</SelectItem>
                  <SelectItem value="copied">Copied</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Status</Label>
              <Select
                value={statusFilter}
                onValueChange={(v) => setStatusFilter(v as typeof statusFilter)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All</SelectItem>
                  <SelectItem value="pending">Pending</SelectItem>
                  <SelectItem value="paid">Paid</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Type</Label>
              <Select value={typeFilter} onValueChange={setTypeFilter}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All types</SelectItem>
                  {typeOptions.map((t) => (
                    <SelectItem key={t} value={t}>
                      {t}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="inv-sync-from">From date</Label>
              <Input
                id="inv-sync-from"
                type="date"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="inv-sync-to">To date</Label>
              <Input
                id="inv-sync-to"
                type="date"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
              />
            </div>
          </div>

          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Filter className="h-4 w-4" />
              {filtered.length} shown · {selectedDocs.length} selected
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => toggleAllFiltered(!allFilteredSelected)}
                disabled={filtered.length === 0}
              >
                {allFilteredSelected ? "Clear page" : "Select page"}
              </Button>
              <Button
                type="button"
                size="sm"
                onClick={() => void handleFillTemplate()}
                disabled={filling || selectedDocs.length === 0}
              >
                {filling ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Filling…
                  </>
                ) : (
                  <>
                    <Copy className="mr-2 h-4 w-4" />
                    Fill template ({selectedDocs.length})
                  </>
                )}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="flex items-center gap-2 p-6 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading synced invoices…
            </div>
          ) : filtered.length === 0 ? (
            <div className="p-6 text-sm text-muted-foreground">
              No synced invoices match these filters. Only new PrepCorex invoices created
              after deploy appear here (no backfill).
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[880px] text-sm">
                <thead className="border-b bg-muted/40 text-left">
                  <tr>
                    <th className="px-3 py-2 w-10">
                      <Checkbox
                        checked={allFilteredSelected}
                        onCheckedChange={(v) => toggleAllFiltered(v === true)}
                        aria-label="Select all filtered"
                      />
                    </th>
                    <th className="px-3 py-2">Invoice</th>
                    <th className="px-3 py-2">Client</th>
                    <th className="px-3 py-2">Date</th>
                    <th className="px-3 py-2">Type</th>
                    <th className="px-3 py-2">Status</th>
                    <th className="px-3 py-2 text-right">Total</th>
                    <th className="px-3 py-2">Badge</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((row) => {
                    const copied = isCopiedSyncDoc(row);
                    return (
                      <tr
                        key={row.id}
                        className={cn(
                          "border-b last:border-0",
                          selected[row.id] && "bg-primary/5"
                        )}
                      >
                        <td className="px-3 py-2">
                          <Checkbox
                            checked={Boolean(selected[row.id])}
                            onCheckedChange={(v) =>
                              setSelected((prev) => ({ ...prev, [row.id]: v === true }))
                            }
                            aria-label={`Select ${row.invoiceNumber}`}
                          />
                        </td>
                        <td className="px-3 py-2 font-medium">
                          {row.invoiceNumber}
                          <div className="text-xs text-muted-foreground">
                            {row.itemCount ?? row.items?.length ?? 0} item(s)
                          </div>
                        </td>
                        <td className="px-3 py-2">
                          <div>{row.clientName || "—"}</div>
                          <div className="text-xs text-muted-foreground">
                            {row.clientEmail || "—"}
                          </div>
                        </td>
                        <td className="px-3 py-2 whitespace-nowrap">
                          {formatDate(row.invoiceDate)}
                        </td>
                        <td className="px-3 py-2">{row.type || "—"}</td>
                        <td className="px-3 py-2 capitalize">{row.status || "—"}</td>
                        <td className="px-3 py-2 text-right font-medium">
                          {formatMoney(row.grandTotal)}
                        </td>
                        <td className="px-3 py-2">
                          {copied ? (
                            <div className="flex flex-col items-start gap-1">
                              <Badge className="bg-emerald-100 text-emerald-900 hover:bg-emerald-100">
                                Copied
                              </Badge>
                              <button
                                type="button"
                                className="text-[11px] text-muted-foreground underline"
                                onClick={() => void markNotCopied(row)}
                              >
                                Clear badge
                              </button>
                            </div>
                          ) : (
                            <Badge variant="outline">Not copied</Badge>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
