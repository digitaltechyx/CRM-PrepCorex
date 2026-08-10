"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDocs,
  query,
  serverTimestamp,
  updateDoc,
  orderBy,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { BookUser, Loader2, Plus, RefreshCcw, ShieldAlert, ShieldCheck, Trash2, UserPlus } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { useCollection } from "@/hooks/use-collection";
import {
  type AddressBookSeed,
  type CrmAddressContact,
  type CrmContactSource,
  contactMatchesQuery,
  contactSourceLabel,
  findExistingContact,
  isSpamContact,
  mapPrepCorexUser,
  mergeSeedIntoContact,
  stripUndefinedFields,
} from "@/lib/crm-address-book";
import { ConvertContactToLeadDialog } from "@/components/crm/address-book/convert-contact-to-lead-dialog";

type ContactForm = {
  fullName: string;
  company: string;
  email: string;
  phone: string;
  facebookMessengerId: string;
  whatsappId: string;
  address: string;
  city: string;
  state: string;
  zip: string;
  country: string;
  notes: string;
};

const EMPTY_FORM: ContactForm = {
  fullName: "",
  company: "",
  email: "",
  phone: "",
  facebookMessengerId: "",
  whatsappId: "",
  address: "",
  city: "",
  state: "",
  zip: "",
  country: "",
  notes: "",
};

type SyncKey = "leads" | "quotes" | "invoices" | "prepcorex" | "email" | "facebook" | "whatsapp";

type AddressBookMode = "active" | "spam";

type AddressBookClientProps = {
  /** active = normal address book (hides spam). spam = spam folder. */
  mode?: AddressBookMode;
};

function fromLead(data: Record<string, unknown>): AddressBookSeed {
  return {
    fullName: String(data.leadName || "").trim(),
    company: String(data.company || "").trim(),
    email: String(data.email || "").trim(),
    phone: String(data.phone || "").trim(),
    country: String(data.country || "").trim(),
    notes: String(data.notes || "").trim(),
    source: "lead",
  };
}

function fromQuote(data: Record<string, unknown>): AddressBookSeed {
  return {
    fullName: String(data.recipientName || "").trim(),
    company: String(data.recipientCompany || "").trim(),
    email: String(data.recipientEmail || "").trim(),
    phone: String(data.recipientPhone || "").trim(),
    address: String(data.recipientAddress || "").trim(),
    city: String(data.recipientCity || "").trim(),
    state: String(data.recipientState || "").trim(),
    zip: String(data.recipientZip || "").trim(),
    country: String(data.recipientCountry || "").trim(),
    source: "quote",
  };
}

function fromInvoice(data: Record<string, unknown>): AddressBookSeed {
  return {
    fullName: String(data.clientName || "").trim(),
    email: String(data.clientEmail || "").trim(),
    phone: String(data.clientPhone || "").trim(),
    address: String(data.clientAddress || "").trim(),
    city: String(data.clientCity || "").trim(),
    state: String(data.clientState || "").trim(),
    zip: String(data.clientZip || "").trim(),
    country: String(data.clientCountry || "").trim(),
    source: "invoice",
  };
}

export function AddressBookClient({ mode = "active" }: AddressBookClientProps) {
  const isSpamMode = mode === "spam";
  const { user } = useAuth();
  const { toast } = useToast();
  const [search, setSearch] = useState("");
  const [countryFilter, setCountryFilter] = useState("");
  const [companyFilter, setCompanyFilter] = useState("");
  const [sourceFilter, setSourceFilter] = useState<"all" | CrmContactSource>("all");
  const [completenessFilter, setCompletenessFilter] = useState<"all" | "with_email" | "with_phone" | "with_address">("all");
  const [sortBy, setSortBy] = useState<"recent" | "name_asc" | "name_desc" | "company_asc">("recent");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<CrmAddressContact | null>(null);
  const [saving, setSaving] = useState(false);
  const [syncing, setSyncing] = useState<"" | SyncKey>("");
  const [form, setForm] = useState<ContactForm>(EMPTY_FORM);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [spamBusy, setSpamBusy] = useState(false);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [convertOpen, setConvertOpen] = useState(false);
  const [convertContacts, setConvertContacts] = useState<CrmAddressContact[]>([]);
  const autoEmailSyncStarted = useRef(false);
  const autoFacebookSyncStarted = useRef(false);

  const contactsQuery = useMemo(
    () => query(collection(db, "crm_contacts"), orderBy("updatedAt", "desc")),
    []
  );
  const { data: contacts, loading } = useCollection<CrmAddressContact>("crm_contacts", contactsQuery);

  const filtered = useMemo(() => {
    const base = contacts.filter((c) => {
      if (isSpamMode ? !isSpamContact(c) : isSpamContact(c)) return false;
      if (!contactMatchesQuery(c, search)) return false;
      if (sourceFilter !== "all" && (c.source || "manual") !== sourceFilter) return false;
      if (countryFilter.trim() && !(c.country || "").toLowerCase().includes(countryFilter.trim().toLowerCase())) return false;
      if (companyFilter.trim() && !(c.company || "").toLowerCase().includes(companyFilter.trim().toLowerCase())) return false;
      if (completenessFilter === "with_email" && !c.email) return false;
      if (completenessFilter === "with_phone" && !c.phone) return false;
      if (completenessFilter === "with_address" && ![c.address, c.city, c.state, c.zip, c.country].some(Boolean)) return false;
      return true;
    });

    if (sortBy === "recent") return base;
    const next = [...base];
    if (sortBy === "name_asc") next.sort((a, b) => (a.fullName || "").localeCompare(b.fullName || "", undefined, { sensitivity: "base" }));
    if (sortBy === "name_desc") next.sort((a, b) => (b.fullName || "").localeCompare(a.fullName || "", undefined, { sensitivity: "base" }));
    if (sortBy === "company_asc") next.sort((a, b) => (a.company || "").localeCompare(b.company || "", undefined, { sensitivity: "base" }));
    return next;
  }, [contacts, isSpamMode, search, sourceFilter, countryFilter, companyFilter, completenessFilter, sortBy]);

  const visibleCount = useMemo(
    () => contacts.filter((c) => (isSpamMode ? isSpamContact(c) : !isSpamContact(c))).length,
    [contacts, isSpamMode]
  );

  const allFilteredSelected =
    filtered.length > 0 && filtered.every((c) => selectedIds.has(c.id));

  function toggleSelectAllFiltered() {
    if (allFilteredSelected) {
      setSelectedIds(new Set());
      return;
    }
    setSelectedIds(new Set(filtered.map((c) => c.id)));
  }

  function toggleSelectOne(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function openNew() {
    setEditing(null);
    setForm(EMPTY_FORM);
    setDialogOpen(true);
  }

  function openEdit(contact: CrmAddressContact) {
    setEditing(contact);
    setForm({
      fullName: contact.fullName || "",
      company: contact.company || "",
      email: contact.email || "",
      phone: contact.phone || "",
      facebookMessengerId: contact.facebookMessengerId || "",
      whatsappId: contact.whatsappId || "",
      address: contact.address || "",
      city: contact.city || "",
      state: contact.state || "",
      zip: contact.zip || "",
      country: contact.country || "",
      notes: contact.notes || "",
    });
    setDialogOpen(true);
  }

  function openConvertToLead(contactsToConvert: CrmAddressContact[]) {
    if (contactsToConvert.length === 0) {
      toast({ variant: "destructive", title: "Select at least one contact." });
      return;
    }
    setConvertContacts(contactsToConvert);
    setConvertOpen(true);
  }

  async function upsertSeed(
    seed: AddressBookSeed,
    working: CrmAddressContact[]
  ): Promise<"created" | "updated" | "skipped"> {
    if (
      !seed.fullName &&
      !seed.email &&
      !seed.phone &&
      !seed.prepcorexUserId &&
      !seed.facebookMessengerId &&
      !seed.whatsappId
    ) {
      return "skipped";
    }
    const existing = findExistingContact(working, seed);
    if (isSpamContact(existing)) return "skipped";
    const merged = stripUndefinedFields(
      mergeSeedIntoContact(existing, seed) as Record<string, unknown>
    ) as Omit<CrmAddressContact, "id">;
    if (existing) {
      // Never overwrite createdBy/createdAt with missing values on update.
      const { createdBy: _cb, createdAt: _ca, updatedAt: _ua, ...updatePayload } = merged;
      await updateDoc(doc(db, "crm_contacts", existing.id), {
        ...stripUndefinedFields(updatePayload as Record<string, unknown>),
        updatedAt: serverTimestamp(),
      });
      const idx = working.findIndex((c) => c.id === existing.id);
      if (idx >= 0) working[idx] = { ...existing, ...merged };
      return "updated";
    }
    const ref = await addDoc(collection(db, "crm_contacts"), {
      ...merged,
      createdBy: user?.uid || "",
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    working.push({ id: ref.id, ...merged });
    return "created";
  }

  async function setSpamForSelected(markSpam: boolean) {
    if (selectedIds.size === 0) {
      toast({ variant: "destructive", title: "Select at least one contact." });
      return;
    }
    setSpamBusy(true);
    try {
      const ids = [...selectedIds];
      for (const id of ids) {
        if (markSpam) {
          await updateDoc(doc(db, "crm_contacts", id), {
            isSpam: true,
            spamMarkedAt: serverTimestamp(),
            spamMarkedBy: user?.uid || "",
            updatedAt: serverTimestamp(),
          });
        } else {
          await updateDoc(doc(db, "crm_contacts", id), {
            isSpam: false,
            spamMarkedAt: null,
            spamMarkedBy: "",
            updatedAt: serverTimestamp(),
          });
        }
      }
      setSelectedIds(new Set());
      toast({
        title: markSpam ? "Marked as spam" : "Restored from spam",
        description: `${ids.length} contact(s) updated. Spam contacts are excluded from future syncs.`,
      });
    } catch (error) {
      console.error(error);
      toast({
        variant: "destructive",
        title: markSpam ? "Failed to mark spam" : "Failed to restore contacts",
      });
    } finally {
      setSpamBusy(false);
    }
  }

  async function deleteSelectedContacts() {
    if (selectedIds.size === 0) {
      toast({ variant: "destructive", title: "Select at least one contact." });
      return;
    }
    setDeleteBusy(true);
    try {
      const ids = [...selectedIds];
      for (const id of ids) {
        await deleteDoc(doc(db, "crm_contacts", id));
      }
      setSelectedIds(new Set());
      setDeleteConfirmOpen(false);
      toast({
        title: "Contacts deleted",
        description: `${ids.length} contact(s) removed. Sync can recreate them if they appear again from PrepCorex, email, or other sources.`,
      });
    } catch (error) {
      console.error(error);
      toast({
        variant: "destructive",
        title: "Failed to delete contacts",
        description: error instanceof Error ? error.message : undefined,
      });
    } finally {
      setDeleteBusy(false);
    }
  }

  async function saveContact() {
    if (
      !form.fullName.trim() &&
      !form.email.trim() &&
      !form.phone.trim() &&
      !form.facebookMessengerId.trim() &&
      !form.whatsappId.trim()
    ) {
      toast({
        variant: "destructive",
        title: "Add at least name, email, phone, Messenger ID, or WhatsApp ID.",
      });
      return;
    }
    setSaving(true);
    try {
      const seed: AddressBookSeed = {
        fullName: form.fullName.trim(),
        company: form.company.trim(),
        email: form.email.trim(),
        phone: form.phone.trim(),
        facebookMessengerId: form.facebookMessengerId.trim(),
        whatsappId: form.whatsappId.trim(),
        address: form.address.trim(),
        city: form.city.trim(),
        state: form.state.trim(),
        zip: form.zip.trim(),
        country: form.country.trim(),
        notes: form.notes.trim(),
        source: editing?.source || "manual",
        prepcorexUserId: editing?.prepcorexUserId,
      };
      const merged = stripUndefinedFields(
        mergeSeedIntoContact(editing, seed) as Record<string, unknown>
      ) as Omit<CrmAddressContact, "id">;
      if (editing) {
        const { createdBy: _cb, createdAt: _ca, updatedAt: _ua, ...updatePayload } = merged;
        await updateDoc(doc(db, "crm_contacts", editing.id), {
          ...stripUndefinedFields(updatePayload as Record<string, unknown>),
          updatedAt: serverTimestamp(),
        });
      } else {
        await addDoc(collection(db, "crm_contacts"), {
          ...merged,
          createdBy: user?.uid || "",
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      }
      setDialogOpen(false);
      toast({ title: editing ? "Contact updated" : "Contact added" });
    } catch (error) {
      console.error(error);
      toast({ variant: "destructive", title: "Failed to save contact" });
    } finally {
      setSaving(false);
    }
  }

  async function syncCollection(
    key: Exclude<SyncKey, "prepcorex">,
    path: string,
    mapper: (data: Record<string, unknown>) => AddressBookSeed
  ) {
    setSyncing(key);
    try {
      const snap = await getDocs(collection(db, path));
      const working = [...contacts];
      let created = 0;
      let updated = 0;
      let skipped = 0;
      for (const row of snap.docs) {
        const result = await upsertSeed(mapper(row.data() as Record<string, unknown>), working);
        if (result === "created") created += 1;
        else if (result === "updated") updated += 1;
        else skipped += 1;
      }
      toast({
        title: "Address book sync complete",
        description: `${created} created, ${updated} updated, ${skipped} skipped.`,
      });
    } catch (error) {
      console.error(error);
      toast({ variant: "destructive", title: "Sync failed" });
    } finally {
      setSyncing("");
    }
  }

  async function syncPrepCorexUsers() {
    setSyncing("prepcorex");
    try {
      const snap = await getDocs(collection(db, "users"));
      const working = [...contacts];
      let created = 0;
      let updated = 0;
      let skippedStaff = 0;
      let skippedIncomplete = 0;
      for (const row of snap.docs) {
        const mapped = mapPrepCorexUser(row.id, row.data() as Record<string, unknown>);
        if (!mapped.ok) {
          if (mapped.reason === "non_client") skippedStaff += 1;
          else skippedIncomplete += 1;
          continue;
        }
        const result = await upsertSeed(mapped.seed, working);
        if (result === "created") created += 1;
        else if (result === "updated") updated += 1;
        else skippedIncomplete += 1;
      }
      toast({
        title: "PrepCorex sync complete",
        description: `${created} created, ${updated} updated. Skipped ${skippedStaff} staff accounts, ${skippedIncomplete} incomplete. Deleted and pending clients are included.`,
      });
    } catch (error) {
      console.error(error);
      toast({ variant: "destructive", title: "PrepCorex sync failed" });
    } finally {
      setSyncing("");
    }
  }

  /**
   * Pull sender name/email + signature phone/company from info@ + arshad@.
   * Body is not stored. Outbound stays info@.
   * @param opts.quiet — page-load auto sync: toast only when something changed / on error
   */
  async function syncEmailSenders(
    mode?: "full" | "incremental",
    opts?: { quiet?: boolean }
  ) {
    const quiet = opts?.quiet === true;
    if (!user) {
      if (!quiet) toast({ variant: "destructive", title: "Sign in required" });
      return;
    }
    if (syncing !== "") return;
    setSyncing("email");
    try {
      const idToken = await user.getIdToken();
      const res = await fetch("/api/email/sync-contacts", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${idToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(mode ? { mode } : {}),
      });
      const data = (await res.json()) as {
        error?: string;
        mode?: string;
        created?: number;
        updated?: number;
        skipped?: number;
        sendersFound?: number;
        mailboxes?: Array<{ mailbox: string; messagesScanned: number; uniqueSenders: number; signaturesParsed?: number; error?: string }>;
      };
      if (!res.ok) {
        throw new Error(data.error || "Email sync failed");
      }
      const created = data.created ?? 0;
      const updated = data.updated ?? 0;
      const sendersFound = data.sendersFound ?? 0;
      const mailboxSummary = (data.mailboxes || [])
        .map((m) =>
          m.error
            ? `${m.mailbox}: error`
            : `${m.mailbox}: ${m.uniqueSenders} senders (${m.messagesScanned} msgs)`
        )
        .join(" · ");
      const changed = created > 0 || updated > 0 || sendersFound > 0;
      if (!quiet || changed) {
        toast({
          title: quiet
            ? "Inbox contacts updated"
            : `Email sync complete (${data.mode || "sync"})`,
          description: `${created} created, ${updated} updated, ${sendersFound} senders. ${mailboxSummary}`,
        });
      }
    } catch (error) {
      console.error(error);
      toast({
        variant: "destructive",
        title: "Email sync failed",
        description: error instanceof Error ? error.message : undefined,
      });
    } finally {
      setSyncing("");
    }
  }

  /**
   * Pull people who messaged the Facebook Page (name + Messenger PSID).
   * @param opts.quiet — page-load auto sync: toast only when something changed / on real errors
   */
  async function syncFacebookMessenger(opts?: { quiet?: boolean }) {
    const quiet = opts?.quiet === true;
    if (!user) {
      if (!quiet) toast({ variant: "destructive", title: "Sign in required" });
      return;
    }
    if (!quiet) {
      if (syncing !== "") return;
      setSyncing("facebook");
    }
    try {
      const idToken = await user.getIdToken();
      const res = await fetch("/api/facebook/sync-contacts", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${idToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(quiet ? { quiet: true } : {}),
      });
      const data = (await res.json()) as {
        error?: string;
        configured?: boolean;
        created?: number;
        updated?: number;
        skipped?: number;
        contactsFound?: number;
        conversationsScanned?: number;
      };
      if (!res.ok) {
        throw new Error(data.error || "Facebook sync failed");
      }
      if (data.configured === false) {
        if (!quiet) {
          toast({
            variant: "destructive",
            title: "Facebook not configured",
            description:
              data.error ||
              "Set FACEBOOK_PAGE_ID and FACEBOOK_PAGE_ACCESS_TOKEN in the CRM env.",
          });
        }
        return;
      }
      const created = data.created ?? 0;
      const updated = data.updated ?? 0;
      const contactsFound = data.contactsFound ?? 0;
      const changed = created > 0 || updated > 0 || contactsFound > 0;
      if (!quiet || changed) {
        toast({
          title: quiet ? "Facebook contacts updated" : "Facebook sync complete",
          description: `${created} created, ${updated} updated, ${contactsFound} Messenger contacts (${data.conversationsScanned ?? 0} conversations).`,
        });
      }
    } catch (error) {
      console.error(error);
      const message = error instanceof Error ? error.message : undefined;
      if (!quiet || !/not configured/i.test(message || "")) {
        toast({
          variant: "destructive",
          title: "Facebook sync failed",
          description: message,
        });
      }
    } finally {
      if (!quiet) setSyncing("");
    }
  }

  /** WhatsApp Cloud API has no bulk pull — this checks webhook/API config status. */
  async function checkWhatsAppStatus() {
    if (!user) {
      toast({ variant: "destructive", title: "Sign in required" });
      return;
    }
    if (syncing !== "") return;
    setSyncing("whatsapp");
    try {
      const idToken = await user.getIdToken();
      const res = await fetch("/api/whatsapp/status", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${idToken}`,
          "Content-Type": "application/json",
        },
        body: "{}",
      });
      const data = (await res.json()) as {
        error?: string;
        configured?: boolean;
        webhookUrl?: string;
        apiPing?: {
          ok?: boolean;
          error?: string;
          displayPhoneNumber?: string;
          verifiedName?: string;
        };
        note?: string;
      };
      if (!res.ok) {
        throw new Error(data.error || "WhatsApp status check failed");
      }
      const ping = data.apiPing;
      const pingLine = ping
        ? ping.ok
          ? `API OK${ping.verifiedName ? ` · ${ping.verifiedName}` : ""}${
              ping.displayPhoneNumber ? ` · ${ping.displayPhoneNumber}` : ""
            }`
          : `API: ${ping.error || "not checked"}`
        : "API token/phone id not set (webhook can still work)";
      toast({
        title: data.configured ? "WhatsApp webhook ready" : "WhatsApp not configured",
        description: `${pingLine}. Contacts appear when people message you. ${data.webhookUrl || ""}`,
      });
    } catch (error) {
      console.error(error);
      toast({
        variant: "destructive",
        title: "WhatsApp status failed",
        description: error instanceof Error ? error.message : undefined,
      });
    } finally {
      setSyncing("");
    }
  }

  // Auto-sync inboxes when the address book page opens (once per visit).
  useEffect(() => {
    if (isSpamMode) return;
    if (!user || autoEmailSyncStarted.current) return;
    autoEmailSyncStarted.current = true;
    void syncEmailSenders(undefined, { quiet: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional once-per-visit when user is ready
  }, [user, isSpamMode]);

  // Auto-sync Facebook Messenger contacts once per visit when configured.
  useEffect(() => {
    if (isSpamMode) return;
    if (!user || autoFacebookSyncStarted.current) return;
    autoFacebookSyncStarted.current = true;
    void syncFacebookMessenger({ quiet: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional once-per-visit when user is ready
  }, [user, isSpamMode]);

  function resetFilters() {
    setSearch("");
    setCountryFilter("");
    setCompanyFilter("");
    setSourceFilter("all");
    setCompletenessFilter("all");
    setSortBy("recent");
    setSelectedIds(new Set());
  }

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <Card>
        <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              {isSpamMode ? <ShieldAlert className="h-5 w-5" /> : <BookUser className="h-5 w-5" />}
              {isSpamMode ? "Spam contacts" : "Address book"}
            </CardTitle>
            <CardDescription>
              {isSpamMode
                ? "Contacts marked as spam. They stay blocked from PrepCorex, email, Facebook, WhatsApp, lead, quotation, and invoice sync."
                : "Unified contacts from PrepCorex, email, Facebook Messenger, WhatsApp Cloud API, leads, quotations, and invoices."}
            </CardDescription>
          </div>
          <div className="flex flex-wrap gap-2">
            {!isSpamMode && (
              <>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => void syncPrepCorexUsers()}
                  disabled={syncing !== ""}
                >
                  {syncing === "prepcorex" ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <RefreshCcw className="mr-2 h-4 w-4" />
                  )}
                  Sync PrepCorex
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => void syncEmailSenders()}
                  disabled={syncing !== "" || !user}
                  title="First run does a full inbox scan; later runs are incremental"
                >
                  {syncing === "email" ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <RefreshCcw className="mr-2 h-4 w-4" />
                  )}
                  Sync emails
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => void syncFacebookMessenger()}
                  disabled={syncing !== "" || !user}
                  title="People who messaged your Facebook Page"
                >
                  {syncing === "facebook" ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <RefreshCcw className="mr-2 h-4 w-4" />
                  )}
                  Sync Facebook
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => void checkWhatsAppStatus()}
                  disabled={syncing !== "" || !user}
                  title="WhatsApp contacts arrive via webhook when people message you"
                >
                  {syncing === "whatsapp" ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <RefreshCcw className="mr-2 h-4 w-4" />
                  )}
                  WhatsApp status
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => syncCollection("leads", "crmLeads", fromLead)}
                  disabled={syncing !== ""}
                >
                  {syncing === "leads" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCcw className="mr-2 h-4 w-4" />}
                  Sync leads
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => syncCollection("quotes", "quotes", fromQuote)}
                  disabled={syncing !== ""}
                >
                  {syncing === "quotes" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCcw className="mr-2 h-4 w-4" />}
                  Sync quotations
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => syncCollection("invoices", "external_invoices", fromInvoice)}
                  disabled={syncing !== ""}
                >
                  {syncing === "invoices" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCcw className="mr-2 h-4 w-4" />}
                  Sync invoices
                </Button>
                <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
                  <DialogTrigger asChild>
                    <Button size="sm" onClick={openNew}>
                      <Plus className="mr-2 h-4 w-4" />
                      New contact
                    </Button>
                  </DialogTrigger>
                  <DialogContent className="max-w-2xl">
                    <DialogHeader>
                      <DialogTitle>{editing ? "Edit contact" : "New contact"}</DialogTitle>
                    </DialogHeader>
                    <div className="grid gap-3 md:grid-cols-2">
                      <div><Label>Name</Label><Input value={form.fullName} onChange={(e) => setForm((p) => ({ ...p, fullName: e.target.value }))} /></div>
                      <div><Label>Company</Label><Input value={form.company} onChange={(e) => setForm((p) => ({ ...p, company: e.target.value }))} /></div>
                      <div><Label>Email</Label><Input value={form.email} onChange={(e) => setForm((p) => ({ ...p, email: e.target.value }))} /></div>
                      <div><Label>Phone</Label><Input value={form.phone} onChange={(e) => setForm((p) => ({ ...p, phone: e.target.value }))} /></div>
                      <div className="md:col-span-2">
                        <Label>Messenger ID</Label>
                        <Input
                          value={form.facebookMessengerId}
                          onChange={(e) =>
                            setForm((p) => ({ ...p, facebookMessengerId: e.target.value }))
                          }
                          placeholder="Page-scoped ID from Facebook sync"
                        />
                      </div>
                      <div className="md:col-span-2">
                        <Label>WhatsApp ID</Label>
                        <Input
                          value={form.whatsappId}
                          onChange={(e) => setForm((p) => ({ ...p, whatsappId: e.target.value }))}
                          placeholder="Digits from WhatsApp Cloud API (wa_id)"
                        />
                      </div>
                      <div className="md:col-span-2"><Label>Address</Label><Input value={form.address} onChange={(e) => setForm((p) => ({ ...p, address: e.target.value }))} /></div>
                      <div><Label>City</Label><Input value={form.city} onChange={(e) => setForm((p) => ({ ...p, city: e.target.value }))} /></div>
                      <div><Label>State</Label><Input value={form.state} onChange={(e) => setForm((p) => ({ ...p, state: e.target.value }))} /></div>
                      <div><Label>Zip</Label><Input value={form.zip} onChange={(e) => setForm((p) => ({ ...p, zip: e.target.value }))} /></div>
                      <div><Label>Country</Label><Input value={form.country} onChange={(e) => setForm((p) => ({ ...p, country: e.target.value }))} /></div>
                      <div className="md:col-span-2"><Label>Notes</Label><Input value={form.notes} onChange={(e) => setForm((p) => ({ ...p, notes: e.target.value }))} /></div>
                    </div>
                    <DialogFooter>
                      <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
                      <Button onClick={saveContact} disabled={saving}>
                        {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                        Save
                      </Button>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>
              </>
            )}
            {isSpamMode ? (
              <Button
                variant="outline"
                size="sm"
                onClick={() => void setSpamForSelected(false)}
                disabled={spamBusy || deleteBusy || selectedIds.size === 0}
              >
                {spamBusy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <ShieldCheck className="mr-2 h-4 w-4" />}
                Restore selected ({selectedIds.size})
              </Button>
            ) : (
              <>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    const selected = contacts.filter((c) => selectedIds.has(c.id) && !isSpamContact(c));
                    openConvertToLead(selected);
                  }}
                  disabled={deleteBusy || selectedIds.size === 0 || syncing !== ""}
                >
                  <UserPlus className="mr-2 h-4 w-4" />
                  Convert to lead ({selectedIds.size})
                </Button>
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={() => void setSpamForSelected(true)}
                  disabled={spamBusy || deleteBusy || selectedIds.size === 0 || syncing !== ""}
                >
                  {spamBusy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <ShieldAlert className="mr-2 h-4 w-4" />}
                  Mark as spam ({selectedIds.size})
                </Button>
              </>
            )}
            <Button
              variant="outline"
              size="sm"
              className="border-destructive/40 text-destructive hover:bg-destructive/10 hover:text-destructive"
              onClick={() => {
                if (selectedIds.size === 0) {
                  toast({ variant: "destructive", title: "Select at least one contact." });
                  return;
                }
                setDeleteConfirmOpen(true);
              }}
              disabled={spamBusy || deleteBusy || selectedIds.size === 0 || syncing !== ""}
            >
              {deleteBusy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Trash2 className="mr-2 h-4 w-4" />}
              Delete ({selectedIds.size})
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-6">
            <div className="lg:col-span-2">
              <Label className="mb-1 block text-xs text-muted-foreground">Search</Label>
              <Input
                placeholder="Name, email, company, phone, Messenger, WhatsApp..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <div>
              <Label className="mb-1 block text-xs text-muted-foreground">Source</Label>
              <Select value={sourceFilter} onValueChange={(v) => setSourceFilter(v as typeof sourceFilter)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All sources</SelectItem>
                  <SelectItem value="manual">Manual</SelectItem>
                  <SelectItem value="prepcorex">PrepCorex</SelectItem>
                  <SelectItem value="email">Email</SelectItem>
                  <SelectItem value="facebook">Facebook</SelectItem>
                  <SelectItem value="whatsapp">WhatsApp</SelectItem>
                  <SelectItem value="lead">Lead</SelectItem>
                  <SelectItem value="quote">Quotation</SelectItem>
                  <SelectItem value="invoice">Invoice</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="mb-1 block text-xs text-muted-foreground">Completeness</Label>
              <Select value={completenessFilter} onValueChange={(v) => setCompletenessFilter(v as typeof completenessFilter)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All contacts</SelectItem>
                  <SelectItem value="with_email">Has email</SelectItem>
                  <SelectItem value="with_phone">Has phone</SelectItem>
                  <SelectItem value="with_address">Has address</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="mb-1 block text-xs text-muted-foreground">Country</Label>
              <Input placeholder="e.g. USA" value={countryFilter} onChange={(e) => setCountryFilter(e.target.value)} />
            </div>
            <div>
              <Label className="mb-1 block text-xs text-muted-foreground">Company</Label>
              <Input placeholder="Company contains..." value={companyFilter} onChange={(e) => setCompanyFilter(e.target.value)} />
            </div>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs text-muted-foreground">
              Showing <span className="font-semibold text-foreground">{filtered.length}</span> of{" "}
              <span className="font-semibold text-foreground">{visibleCount}</span>{" "}
              {isSpamMode ? "spam contacts" : "contacts"}
              {selectedIds.size > 0 ? ` · ${selectedIds.size} selected` : ""}
            </p>
            <div className="flex items-center gap-2">
              <div className="w-44">
                <Select value={sortBy} onValueChange={(v) => setSortBy(v as typeof sortBy)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="recent">Sort: Recent</SelectItem>
                    <SelectItem value="name_asc">Sort: Name A-Z</SelectItem>
                    <SelectItem value="name_desc">Sort: Name Z-A</SelectItem>
                    <SelectItem value="company_asc">Sort: Company A-Z</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <Button variant="outline" size="sm" onClick={resetFilters}>Reset filters</Button>
            </div>
          </div>
          <div className="overflow-x-auto rounded-lg border">
            <table className="w-full text-sm">
              <thead className="bg-muted/40">
                <tr className="text-left">
                  <th className="w-10 p-3">
                    <Checkbox
                      checked={allFilteredSelected}
                      onCheckedChange={() => toggleSelectAllFiltered()}
                      aria-label="Select all filtered contacts"
                    />
                  </th>
                  <th className="p-3">Name</th>
                  <th className="p-3">Company</th>
                  <th className="p-3">Email</th>
                  <th className="p-3">Phone</th>
                  <th className="p-3">Messenger</th>
                  <th className="p-3">WhatsApp</th>
                  <th className="p-3">Address</th>
                  <th className="p-3">Source</th>
                  <th className="p-3">Actions</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr><td className="p-4 text-muted-foreground" colSpan={10}>Loading contacts...</td></tr>
                ) : filtered.length === 0 ? (
                  <tr>
                    <td className="p-4 text-muted-foreground" colSpan={10}>
                      {isSpamMode ? "No spam contacts." : "No contacts found."}
                    </td>
                  </tr>
                ) : (
                  filtered.map((c) => (
                    <tr key={c.id} className="border-t">
                      <td className="p-3">
                        <Checkbox
                          checked={selectedIds.has(c.id)}
                          onCheckedChange={() => toggleSelectOne(c.id)}
                          aria-label={`Select ${c.fullName || c.email || "contact"}`}
                        />
                      </td>
                      <td className="p-3 font-medium">{c.fullName || "—"}</td>
                      <td className="p-3">{c.company || "—"}</td>
                      <td className="p-3">{c.email || "—"}</td>
                      <td className="p-3">{c.phone || "—"}</td>
                      <td className="p-3 font-mono text-xs">{c.facebookMessengerId || "—"}</td>
                      <td className="p-3 font-mono text-xs">{c.whatsappId || "—"}</td>
                      <td className="p-3">{[c.address, c.city, c.state, c.zip, c.country].filter(Boolean).join(", ") || "—"}</td>
                      <td className="p-3">
                        <Badge variant="secondary">{contactSourceLabel(c.source)}</Badge>
                      </td>
                      <td className="p-3">
                        {!isSpamMode ? (
                          <div className="flex flex-wrap gap-2">
                            <Button variant="outline" size="sm" onClick={() => openEdit(c)}>
                              Edit
                            </Button>
                            <Button variant="outline" size="sm" onClick={() => openConvertToLead([c])}>
                              <UserPlus className="mr-1.5 h-3.5 w-3.5" />
                              To lead
                            </Button>
                          </div>
                        ) : (
                          <Button
                            variant="outline"
                            size="sm"
                            disabled={spamBusy}
                            onClick={() => {
                              setSelectedIds(new Set([c.id]));
                              void (async () => {
                                setSpamBusy(true);
                                try {
                                  await updateDoc(doc(db, "crm_contacts", c.id), {
                                    isSpam: false,
                                    spamMarkedAt: null,
                                    spamMarkedBy: "",
                                    updatedAt: serverTimestamp(),
                                  });
                                  setSelectedIds(new Set());
                                  toast({ title: "Restored from spam", description: "Contact can sync again." });
                                } catch (error) {
                                  console.error(error);
                                  toast({ variant: "destructive", title: "Failed to restore contact" });
                                } finally {
                                  setSpamBusy(false);
                                }
                              })();
                            }}
                          >
                            Restore
                          </Button>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      <AlertDialog open={deleteConfirmOpen} onOpenChange={setDeleteConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Delete {selectedIds.size} contact{selectedIds.size === 1 ? "" : "s"}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              This permanently removes the selected contact(s) from the address book.
              Unlike spam, deleted contacts can reappear after the next PrepCorex, email, Facebook,
              or other sync if they still exist in those sources.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteBusy}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={deleteBusy}
              onClick={(e) => {
                e.preventDefault();
                void deleteSelectedContacts();
              }}
            >
              {deleteBusy ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Deleting…
                </>
              ) : (
                "Delete"
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <ConvertContactToLeadDialog
        open={convertOpen}
        onOpenChange={(open) => {
          setConvertOpen(open);
          if (!open) setConvertContacts([]);
        }}
        contacts={convertContacts}
        onConverted={() => setSelectedIds(new Set())}
      />
    </div>
  );
}
