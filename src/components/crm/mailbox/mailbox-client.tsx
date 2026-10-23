"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  Inbox,
  Send,
  FileEdit,
  ShieldAlert,
  Trash2,
  RefreshCw,
  PenSquare,
  Loader2,
  Reply,
  ReplyAll,
  Forward,
  Star,
  Paperclip,
  Search,
  MailOpen,
  Archive,
  Clock,
  FolderInput,
  ChevronLeft,
  ChevronRight,
  Plus,
} from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import {
  MAILBOX_FOLDERS,
  type CrmMailboxMessage,
  type MailboxFolderKey,
} from "@/lib/mailbox-types";
import { MAILBOX_SIGNATURE_PLAIN } from "@/lib/mailbox-signature";
import {
  MailboxCompose,
  type ComposeAttachment,
  type ComposeMode,
} from "@/components/crm/mailbox/mailbox-compose";

type ListFilter = "all" | "unread" | "read" | "starred";

const PAGE_SIZE = 25;

const folderIcons: Record<MailboxFolderKey, typeof Inbox> = {
  inbox: Inbox,
  drafts: FileEdit,
  scheduled: Clock,
  sent: Send,
  spam: ShieldAlert,
  trash: Trash2,
};

function formatWhen(isoOrMs: string | number) {
  try {
    const d = typeof isoOrMs === "number" ? new Date(isoOrMs) : new Date(isoOrMs);
    if (Number.isNaN(d.getTime())) return "";
    const now = new Date();
    const sameDay =
      d.getFullYear() === now.getFullYear() &&
      d.getMonth() === now.getMonth() &&
      d.getDate() === now.getDate();
    if (sameDay) {
      return d.toLocaleTimeString(undefined, {
        hour: "numeric",
        minute: "2-digit",
      });
    }
    if (d.getFullYear() === now.getFullYear()) {
      return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
    }
    return d.toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  } catch {
    return "";
  }
}

function extractEmails(raw: string): string[] {
  const matches = String(raw || "").match(
    /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g
  );
  return [...new Set((matches || []).map((e) => e.toLowerCase()))];
}

function formatBytes(size: number) {
  if (!size || size < 1024) return `${size || 0} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(0)} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

function quotedOriginal(msg: CrmMailboxMessage) {
  const body = msg.textBody || msg.snippet || "";
  return `\n\n---------- Forwarded / replied message ----------\nFrom: ${
    msg.fromName ? `${msg.fromName} <${msg.from}>` : msg.from
  }\nDate: ${formatWhen(msg.dateMs || msg.date)}\nSubject: ${msg.subject}\nTo: ${
    msg.to || "—"
  }\n\n${body}`;
}

export function MailboxClient() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [folder, setFolder] = useState<MailboxFolderKey>("inbox");
  const [mailboxEmail, setMailboxEmail] = useState("info@prepservicesfba.com");
  const [messages, setMessages] = useState<CrmMailboxMessage[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selected, setSelected] = useState<CrmMailboxMessage | null>(null);
  const [loading, setLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [composing, setComposing] = useState(false);
  const [composeMode, setComposeMode] = useState<ComposeMode>("new");
  const [sending, setSending] = useState(false);
  const [listFilter, setListFilter] = useState<ListFilter>("all");
  const [search, setSearch] = useState("");
  const [checkedIds, setCheckedIds] = useState<Set<string>>(new Set());
  const [page, setPage] = useState(0);
  const [compose, setCompose] = useState({
    to: "",
    cc: "",
    subject: "",
    message: "",
  });

  /** Always the folder currently shown — sync must reload this, not a stale closure. */
  const folderRef = useRef<MailboxFolderKey>(folder);
  folderRef.current = folder;
  /** Ignore out-of-order list responses (sync vs tab change races). */
  const loadSeqRef = useRef(0);

  const ourEmail = mailboxEmail.toLowerCase();

  const authHeaders = useCallback(async (): Promise<HeadersInit> => {
    if (!user) return {};
    const token = await user.getIdToken();
    const headers: HeadersInit = { Authorization: `Bearer ${token}` };
    const bypass = process.env.NEXT_PUBLIC_VERCEL_PROTECTION_BYPASS;
    if (bypass) headers["x-vercel-protection-bypass"] = bypass;
    return headers;
  }, [user]);

  const loadMessages = useCallback(
    async (
      nextFolder: MailboxFolderKey = folderRef.current,
      opts?: { soft?: boolean }
    ) => {
      if (!user) return;
      const seq = ++loadSeqRef.current;
      const soft = Boolean(opts?.soft);
      if (!soft) setLoading(true);
      try {
        const headers = await authHeaders();
        if (nextFolder === "scheduled") {
          const res = await fetch("/api/mailbox/scheduled", { headers });
          const data = await res.json().catch(() => ({}));
          if (!res.ok) throw new Error(data.error || "Failed to load scheduled");
          const mapped: CrmMailboxMessage[] = (data.messages || []).map(
            (m: {
              id: string;
              to: string;
              cc?: string;
              subject: string;
              snippet: string;
              scheduledFor: string;
              scheduledForMs: number;
              hasAttachments?: boolean;
            }) => ({
              id: m.id,
              mailboxId: "info",
              mailboxEmail,
              folder: "scheduled",
              imapFolder: "scheduled",
              uid: 0,
              subject: m.subject,
              from: mailboxEmail,
              to: m.to,
              cc: m.cc,
              date: m.scheduledFor,
              dateMs: m.scheduledForMs,
              snippet: `Scheduled · ${m.snippet}`,
              seen: true,
              flagged: false,
              hasAttachments: Boolean(m.hasAttachments),
            })
          );
          if (seq !== loadSeqRef.current) return;
          if (nextFolder !== folderRef.current) return;
          setMessages(mapped);
        } else {
          const res = await fetch(
            `/api/mailbox/messages?folder=${nextFolder}&limit=100`,
            { headers }
          );
          const data = await res.json().catch(() => ({}));
          if (!res.ok) throw new Error(data.error || "Failed to load messages");
          if (seq !== loadSeqRef.current) return;
          if (nextFolder !== folderRef.current) return;
          setMailboxEmail(String(data.mailboxEmail || mailboxEmail));
          setMessages(Array.isArray(data.messages) ? data.messages : []);
        }
      } catch (error) {
        if (seq !== loadSeqRef.current) return;
        toast({
          variant: "destructive",
          title: "Could not load mailbox",
          description: error instanceof Error ? error.message : "Try sync again.",
        });
      } finally {
        if (seq === loadSeqRef.current && !soft) setLoading(false);
      }
    },
    [authHeaders, mailboxEmail, toast, user]
  );

  const syncMailbox = useCallback(async () => {
    if (!user) return;
    setSyncing(true);
    try {
      const headers = await authHeaders();
      const res = await fetch("/api/mailbox/sync", {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({
          folders: ["inbox", "sent", "drafts", "spam", "trash"],
          limit: 40,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Sync failed");
      const summary = (data.folders || [])
        .map((f: { folder: string; synced: number; error?: string }) =>
          f.error ? `${f.folder}: error` : `${f.folder}: ${f.synced}`
        )
        .join(" · ");
      toast({ title: "Mailbox synced", description: summary || "Done" });
      // Reload whatever tab the admin is on now (not the folder from when sync started).
      await loadMessages(folderRef.current, { soft: true });
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Sync failed",
        description: error instanceof Error ? error.message : "Try again.",
      });
    } finally {
      setSyncing(false);
    }
  }, [authHeaders, loadMessages, toast, user]);

  useEffect(() => {
    void loadMessages(folder);
  }, [folder]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    void syncMailbox();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const filteredMessages = useMemo(() => {
    const q = search.trim().toLowerCase();
    return messages.filter((msg) => {
      if (listFilter === "unread" && msg.seen) return false;
      if (listFilter === "read" && !msg.seen) return false;
      if (listFilter === "starred" && !msg.flagged) return false;
      if (!q) return true;
      return [msg.from, msg.fromName, msg.to, msg.cc, msg.subject, msg.snippet]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(q));
    });
  }, [listFilter, messages, search]);

  const totalPages = Math.max(1, Math.ceil(filteredMessages.length / PAGE_SIZE));
  const pageSafe = Math.min(page, totalPages - 1);
  const pagedMessages = useMemo(
    () =>
      filteredMessages.slice(pageSafe * PAGE_SIZE, pageSafe * PAGE_SIZE + PAGE_SIZE),
    [filteredMessages, pageSafe]
  );

  useEffect(() => {
    setPage(0);
    setCheckedIds(new Set());
  }, [folder, listFilter, search]);

  const unreadInFolder = useMemo(
    () => messages.filter((m) => !m.seen).length,
    [messages]
  );

  const trashMessage = async (msg: CrmMailboxMessage) => {
    try {
      const headers = await authHeaders();
      if (folder === "scheduled" || msg.folder === "scheduled") {
        const res = await fetch(
          `/api/mailbox/scheduled?id=${encodeURIComponent(msg.id)}`,
          { method: "DELETE", headers }
        );
        if (!res.ok) throw new Error("Cancel failed");
        toast({ title: "Scheduled message cancelled" });
      } else {
        const res = await fetch(
          `/api/mailbox/messages/${encodeURIComponent(msg.id)}/move`,
          {
            method: "POST",
            headers: { ...headers, "Content-Type": "application/json" },
            body: JSON.stringify({ targetFolder: "trash" }),
          }
        );
        if (!res.ok) throw new Error("Trash failed");
        toast({ title: "Moved to Trash" });
      }
      if (selectedId === msg.id) {
        setSelected(null);
        setSelectedId(null);
      }
      setCheckedIds((prev) => {
        const next = new Set(prev);
        next.delete(msg.id);
        return next;
      });
      await loadMessages(folder);
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Could not trash message",
        description: error instanceof Error ? error.message : "Try again.",
      });
    }
  };

  const trashChecked = async () => {
    const ids = [...checkedIds];
    for (const id of ids) {
      const msg = messages.find((m) => m.id === id);
      if (msg) await trashMessage(msg);
    }
    setCheckedIds(new Set());
  };

  const openMessage = async (msg: CrmMailboxMessage) => {
    setComposing(false);
    setSelectedId(msg.id);
    setSelected(msg);
    if (msg.folder === "scheduled") return;
    try {
      const headers = await authHeaders();
      const res = await fetch(`/api/mailbox/messages/${encodeURIComponent(msg.id)}`, {
        headers,
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.message) {
        setSelected(data.message);
        setMessages((prev) =>
          prev.map((m) => (m.id === msg.id ? { ...m, seen: true } : m))
        );
      }
    } catch {
      /* keep preview */
    }
  };

  const updateFlags = async (
    msg: CrmMailboxMessage,
    patch: { flagged?: boolean; seen?: boolean }
  ) => {
    try {
      const headers = await authHeaders();
      const res = await fetch(
        `/api/mailbox/messages/${encodeURIComponent(msg.id)}/flags`,
        {
          method: "POST",
          headers: { ...headers, "Content-Type": "application/json" },
          body: JSON.stringify(patch),
        }
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Flag update failed");
      const next = data.message as CrmMailboxMessage;
      setMessages((prev) => prev.map((m) => (m.id === msg.id ? { ...m, ...next } : m)));
      if (selectedId === msg.id) setSelected((prev) => (prev ? { ...prev, ...next } : prev));
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Could not update message",
        description: error instanceof Error ? error.message : "Try again.",
      });
    }
  };

  const moveSelected = async (targetFolder: MailboxFolderKey) => {
    if (!selected) return;
    try {
      const headers = await authHeaders();
      if (selected.folder === "scheduled" || folder === "scheduled") {
        const res = await fetch(
          `/api/mailbox/scheduled?id=${encodeURIComponent(selected.id)}`,
          { method: "DELETE", headers }
        );
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || "Cancel failed");
        toast({ title: "Scheduled message cancelled" });
        setSelected(null);
        setSelectedId(null);
        await loadMessages("scheduled");
        return;
      }
      const res = await fetch(
        `/api/mailbox/messages/${encodeURIComponent(selected.id)}/move`,
        {
          method: "POST",
          headers: { ...headers, "Content-Type": "application/json" },
          body: JSON.stringify({ targetFolder }),
        }
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Move failed");
      toast({
        title:
          targetFolder === "trash"
            ? "Moved to Trash"
            : targetFolder === "spam"
              ? "Marked as spam"
              : `Moved to ${targetFolder}`,
      });
      setSelected(null);
      setSelectedId(null);
      await loadMessages(folder);
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Could not move message",
        description: error instanceof Error ? error.message : "Try again.",
      });
    }
  };

  const startCompose = (
    mode: ComposeMode,
    base?: CrmMailboxMessage | null
  ) => {
    setComposeMode(mode);
    setComposing(true);
    setSelectedId(null);

    if (!base || mode === "new") {
      setCompose({
        to: "",
        cc: "",
        subject: "",
        message: `\n\n${MAILBOX_SIGNATURE_PLAIN}`,
      });
      return;
    }

    const isOutbound = base.folder === "sent" || base.folder === "drafts";
    const withSig = (body: string) =>
      `${MAILBOX_SIGNATURE_PLAIN}\n${body}`;

    if (mode === "reply") {
      const replyTo = isOutbound
        ? extractEmails(base.to || "").filter((e) => e !== ourEmail)[0] || base.to
        : base.from;
      setCompose({
        to: replyTo,
        cc: "",
        subject: base.subject.startsWith("Re:") ? base.subject : `Re: ${base.subject}`,
        message: withSig(quotedOriginal(base)),
      });
      return;
    }

    if (mode === "replyAll") {
      const toSet = new Set<string>();
      const ccSet = new Set<string>();
      if (isOutbound) {
        for (const e of extractEmails(base.to || "")) {
          if (e !== ourEmail) toSet.add(e);
        }
        for (const e of extractEmails(base.cc || "")) {
          if (e !== ourEmail && !toSet.has(e)) ccSet.add(e);
        }
      } else {
        for (const e of extractEmails(base.from)) {
          if (e !== ourEmail) toSet.add(e);
        }
        for (const e of extractEmails(base.to || "")) {
          if (e !== ourEmail) {
            if (!toSet.size) toSet.add(e);
            else ccSet.add(e);
          }
        }
        for (const e of extractEmails(base.cc || "")) {
          if (e !== ourEmail && !toSet.has(e)) ccSet.add(e);
        }
      }
      setCompose({
        to: [...toSet].join(", "),
        cc: [...ccSet].join(", "),
        subject: base.subject.startsWith("Re:") ? base.subject : `Re: ${base.subject}`,
        message: withSig(quotedOriginal(base)),
      });
      return;
    }

    // forward
    setCompose({
      to: "",
      cc: "",
      subject: base.subject.startsWith("Fwd:") ? base.subject : `Fwd: ${base.subject}`,
      message: withSig(quotedOriginal(base)),
    });
  };

  const submitCompose = async (opts: {
    draft?: boolean;
    scheduledFor?: string;
    attachments: ComposeAttachment[];
    includeSignature: boolean;
  }) => {
    if (!compose.to.trim()) {
      toast({ variant: "destructive", title: "Add a recipient in To." });
      return;
    }
    setSending(true);
    try {
      const headers = await authHeaders();
      const res = await fetch("/api/mailbox/send", {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({
          to: compose.to.trim(),
          cc: compose.cc.trim() || undefined,
          subject: compose.subject.trim(),
          message: compose.message,
          draft: Boolean(opts.draft),
          scheduledFor: opts.scheduledFor,
          includeSignature: opts.includeSignature,
          attachments: opts.attachments.map((a) => ({
            filename: a.filename,
            contentBase64: a.contentBase64,
          })),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Send failed");
      if (opts.scheduledFor) {
        toast({
          title: "Message scheduled",
          description: `Will send around ${new Date(opts.scheduledFor).toLocaleString()}`,
        });
        setCompose({ to: "", cc: "", subject: "", message: "" });
        setComposing(false);
        setFolder("scheduled");
        await loadMessages("scheduled");
        return;
      }
      toast({
        title: opts.draft ? "Draft saved" : "Email sent",
        description: opts.draft
          ? "Saved in Hostinger Drafts and CRM."
          : "Sent with company signature · copied to Hostinger Sent.",
      });
      setCompose({ to: "", cc: "", subject: "", message: "" });
      setComposing(false);
      const nextFolder: MailboxFolderKey = opts.draft ? "drafts" : "sent";
      setFolder(nextFolder);
      await loadMessages(nextFolder);
    } catch (error) {
      toast({
        variant: "destructive",
        title: opts.draft
          ? "Draft failed"
          : opts.scheduledFor
            ? "Schedule failed"
            : "Send failed",
        description: error instanceof Error ? error.message : "Try again.",
      });
    } finally {
      setSending(false);
    }
  };

  const downloadAttachment = async (msg: CrmMailboxMessage, index: number, filename: string) => {
    try {
      const headers = await authHeaders();
      const res = await fetch(
        `/api/mailbox/messages/${encodeURIComponent(msg.id)}/attachments/${index}`,
        { headers }
      );
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Download failed");
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Attachment download failed",
        description: error instanceof Error ? error.message : "Try again.",
      });
    }
  };

  const selectedBodyHtml = selected?.htmlBody || null;
  const allPageChecked =
    pagedMessages.length > 0 && pagedMessages.every((m) => checkedIds.has(m.id));
  const folderLabel =
    MAILBOX_FOLDERS.find((f) => f.key === folder)?.label || folder;

  return (
    <div className="flex h-[calc(100dvh-5.5rem)] min-h-[560px] flex-col gap-2">
      <div className="flex flex-wrap items-end justify-between gap-2 px-0.5">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-slate-900">Mailbox</h1>
          <p className="text-xs text-slate-500">
            {mailboxEmail} · synced with Hostinger
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          className="h-8 border-slate-200"
          disabled={syncing || !user}
          onClick={() => void syncMailbox()}
        >
          {syncing ? (
            <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
          ) : (
            <RefreshCw className="mr-2 h-3.5 w-3.5" />
          )}
          Sync
        </Button>
      </div>

      {/* Single Hostinger-like shell */}
      <div className="grid min-h-0 flex-1 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm lg:grid-cols-[200px_minmax(300px,0.92fr)_minmax(0,1.28fr)]">
        {/* Folders */}
        <aside className="flex flex-col border-r border-slate-100 bg-slate-50/80 p-3">
          <Button
            className="mb-3 h-10 w-full justify-center gap-2 rounded-xl bg-[#6c47ff] text-sm font-semibold text-white shadow-sm hover:bg-[#5b38f0]"
            onClick={() => startCompose("new")}
          >
            <Plus className="h-4 w-4" />
            New message
          </Button>
          <nav className="flex flex-col gap-0.5">
            {MAILBOX_FOLDERS.map((f) => {
              const Icon = folderIcons[f.key];
              const active = folder === f.key && !composing;
              const showCount = active && unreadInFolder > 0;
              return (
                <button
                  key={f.key}
                  type="button"
                  className={cn(
                    "flex items-center gap-2.5 rounded-lg px-3 py-2 text-left text-[13px] font-medium transition-colors",
                    active
                      ? "bg-white text-slate-900 shadow-sm ring-1 ring-slate-200/80"
                      : "text-slate-600 hover:bg-white/70 hover:text-slate-900"
                  )}
                  onClick={() => {
                    setFolder(f.key);
                    setComposing(false);
                    setSelected(null);
                    setSelectedId(null);
                    setListFilter("all");
                  }}
                >
                  <Icon className="h-4 w-4 shrink-0 opacity-80" />
                  <span className="flex-1 truncate">{f.label}</span>
                  {showCount ? (
                    <span className="rounded-md bg-slate-100 px-1.5 py-0.5 text-[11px] font-semibold text-slate-700">
                      {unreadInFolder}
                    </span>
                  ) : null}
                </button>
              );
            })}
          </nav>
        </aside>

        {/* List */}
        <section className="flex min-h-0 flex-col border-r border-slate-100">
          <div className="space-y-2.5 border-b border-slate-100 px-3 py-3">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <Input
                className="h-9 rounded-full border-slate-200 bg-slate-50 pl-9 text-sm shadow-none focus-visible:ring-[#6c47ff]/30"
                placeholder="Search mail"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <div className="flex items-center justify-between gap-2">
              <div className="flex flex-wrap gap-1">
                {(
                  [
                    ["all", "All mail"],
                    ["unread", "Unread"],
                    ["read", "Read"],
                    ["starred", "Starred"],
                  ] as Array<[ListFilter, string]>
                ).map(([key, label]) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setListFilter(key)}
                    className={cn(
                      "rounded-full px-2.5 py-1 text-[11px] font-semibold transition-colors",
                      listFilter === key
                        ? "bg-[#6c47ff] text-white"
                        : "text-slate-500 hover:bg-slate-100 hover:text-slate-800"
                    )}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <div className="flex shrink-0 items-center gap-0.5 text-[11px] text-slate-500">
                <button
                  type="button"
                  className="rounded p-1 hover:bg-slate-100 disabled:opacity-30"
                  disabled={pageSafe <= 0}
                  onClick={() => setPage((p) => Math.max(0, p - 1))}
                >
                  <ChevronLeft className="h-4 w-4" />
                </button>
                <span className="min-w-[3rem] text-center tabular-nums">
                  {pageSafe + 1}/{totalPages}
                </span>
                <button
                  type="button"
                  className="rounded p-1 hover:bg-slate-100 disabled:opacity-30"
                  disabled={pageSafe >= totalPages - 1}
                  onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
                >
                  <ChevronRight className="h-4 w-4" />
                </button>
              </div>
            </div>
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Checkbox
                  checked={allPageChecked}
                  onCheckedChange={(v) => {
                    if (v) {
                      setCheckedIds(new Set(pagedMessages.map((m) => m.id)));
                    } else {
                      setCheckedIds(new Set());
                    }
                  }}
                  aria-label="Select all on page"
                />
                <span className="text-sm font-semibold capitalize text-slate-800">
                  {composing ? "Compose" : folderLabel}
                </span>
                {checkedIds.size > 0 ? (
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 px-2 text-xs text-red-600"
                    onClick={() => void trashChecked()}
                  >
                    <Trash2 className="mr-1 h-3.5 w-3.5" />
                    Delete ({checkedIds.size})
                  </Button>
                ) : null}
              </div>
            </div>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto">
            {loading ? (
              <div className="flex items-center justify-center gap-2 p-10 text-sm text-slate-500">
                <Loader2 className="h-4 w-4 animate-spin" />
                Loading…
              </div>
            ) : composing ? (
              <div className="p-6 text-sm text-slate-500">
                Writing in the panel on the right →
              </div>
            ) : filteredMessages.length === 0 ? (
              <div className="p-8 text-center text-sm text-slate-500">
                No messages here. Click Sync to pull from Hostinger.
              </div>
            ) : (
              pagedMessages.map((msg) => {
                const displayName =
                  folder === "sent" || folder === "drafts" || folder === "scheduled"
                    ? msg.to || "(no recipient)"
                    : msg.fromName || msg.from;
                const active = selectedId === msg.id;
                return (
                  <div
                    key={msg.id}
                    className={cn(
                      "group relative flex gap-2 border-b border-slate-50 px-2.5 py-2.5 transition-colors",
                      active
                        ? "bg-[#f3efff]"
                        : "hover:bg-slate-50",
                      !msg.seen && !active && "bg-[#faf9ff]"
                    )}
                  >
                    <div className="flex shrink-0 flex-col items-center gap-2 pt-0.5">
                      <Checkbox
                        checked={checkedIds.has(msg.id)}
                        onCheckedChange={(v) => {
                          setCheckedIds((prev) => {
                            const next = new Set(prev);
                            if (v) next.add(msg.id);
                            else next.delete(msg.id);
                            return next;
                          });
                        }}
                        onClick={(e) => e.stopPropagation()}
                      />
                    </div>
                    <button
                      type="button"
                      onClick={() => void openMessage(msg)}
                      className="min-w-0 flex-1 text-left"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex min-w-0 items-center gap-1.5">
                          {!msg.seen ? (
                            <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-[#6c47ff]" />
                          ) : (
                            <span className="h-1.5 w-1.5 shrink-0" />
                          )}
                          <span
                            className={cn(
                              "truncate text-[13px] text-slate-800",
                              !msg.seen && "font-semibold"
                            )}
                          >
                            {displayName}
                          </span>
                          {msg.hasAttachments ? (
                            <Paperclip className="h-3 w-3 shrink-0 text-slate-400" />
                          ) : null}
                        </div>
                        <div className="flex shrink-0 items-center gap-1">
                          <span className="text-[11px] tabular-nums text-slate-400 group-hover:invisible">
                            {formatWhen(msg.dateMs || msg.date)}
                          </span>
                        </div>
                      </div>
                      <div
                        className={cn(
                          "mt-0.5 truncate pl-3 text-[13px] text-slate-700",
                          !msg.seen && "font-medium"
                        )}
                      >
                        {msg.subject || "(no subject)"}
                      </div>
                      <div className="truncate pl-3 text-[12px] text-slate-400">
                        {msg.snippet}
                      </div>
                    </button>
                    <div className="flex shrink-0 flex-col items-end gap-1">
                      <button
                        type="button"
                        title={msg.flagged ? "Unstar" : "Star"}
                        className="rounded p-0.5 text-slate-300 hover:text-amber-500"
                        onClick={(e) => {
                          e.stopPropagation();
                          void updateFlags(msg, { flagged: !msg.flagged });
                        }}
                      >
                        <Star
                          className={cn(
                            "h-3.5 w-3.5",
                            msg.flagged && "fill-amber-400 text-amber-500"
                          )}
                        />
                      </button>
                      <div className="hidden items-center gap-0.5 rounded-md border border-slate-200 bg-white p-0.5 shadow-sm group-hover:flex">
                        <button
                          type="button"
                          title={msg.seen ? "Mark unread" : "Mark read"}
                          className="rounded p-1 text-slate-500 hover:bg-slate-50"
                          onClick={(e) => {
                            e.stopPropagation();
                            void updateFlags(msg, { seen: !msg.seen });
                          }}
                        >
                          <MailOpen className="h-3.5 w-3.5" />
                        </button>
                        <button
                          type="button"
                          title="Spam"
                          className="rounded p-1 text-slate-500 hover:bg-slate-50"
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelected(msg);
                            void (async () => {
                              try {
                                const headers = await authHeaders();
                                await fetch(
                                  `/api/mailbox/messages/${encodeURIComponent(msg.id)}/move`,
                                  {
                                    method: "POST",
                                    headers: {
                                      ...headers,
                                      "Content-Type": "application/json",
                                    },
                                    body: JSON.stringify({
                                      targetFolder:
                                        folder === "spam" ? "inbox" : "spam",
                                    }),
                                  }
                                );
                                toast({
                                  title:
                                    folder === "spam"
                                      ? "Moved to Inbox"
                                      : "Marked as spam",
                                });
                                if (selectedId === msg.id) {
                                  setSelected(null);
                                  setSelectedId(null);
                                }
                                await loadMessages(folder);
                              } catch {
                                toast({
                                  variant: "destructive",
                                  title: "Could not move message",
                                });
                              }
                            })();
                          }}
                        >
                          <ShieldAlert className="h-3.5 w-3.5" />
                        </button>
                        <button
                          type="button"
                          title="Trash"
                          className="rounded p-1 text-slate-500 hover:bg-slate-50"
                          onClick={(e) => {
                            e.stopPropagation();
                            void trashMessage(msg);
                          }}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </section>

        {/* Reader / Compose */}
        <section className="flex min-h-0 flex-col bg-white">
          {composing ? (
            <MailboxCompose
              mode={composeMode}
              to={compose.to}
              cc={compose.cc}
              subject={compose.subject}
              message={compose.message}
              sending={sending}
              onChange={(patch) => setCompose((p) => ({ ...p, ...patch }))}
              onBack={() => setComposing(false)}
              onSend={(opts) => void submitCompose(opts)}
            />
          ) : selected ? (
            <div className="flex min-h-0 flex-1 flex-col">
              <div className="flex shrink-0 items-center gap-0.5 border-b border-slate-100 px-2 py-1.5">
                <IconBtn title="Archive" onClick={() => void moveSelected("trash")}>
                  <Archive className="h-4 w-4" />
                </IconBtn>
                <IconBtn
                  title="Spam"
                  onClick={() =>
                    void moveSelected(folder === "spam" ? "inbox" : "spam")
                  }
                >
                  <ShieldAlert className="h-4 w-4" />
                </IconBtn>
                <IconBtn title="Delete" onClick={() => void moveSelected("trash")}>
                  <Trash2 className="h-4 w-4" />
                </IconBtn>
                <IconBtn
                  title={selected.seen ? "Mark unread" : "Mark read"}
                  onClick={() => void updateFlags(selected, { seen: !selected.seen })}
                >
                  <MailOpen className="h-4 w-4" />
                </IconBtn>
                <IconBtn title="Move" onClick={() => void moveSelected("inbox")}>
                  <FolderInput className="h-4 w-4" />
                </IconBtn>
                <IconBtn
                  title={selected.flagged ? "Unstar" : "Star"}
                  onClick={() =>
                    void updateFlags(selected, { flagged: !selected.flagged })
                  }
                >
                  <Star
                    className={cn(
                      "h-4 w-4",
                      selected.flagged && "fill-amber-400 text-amber-500"
                    )}
                  />
                </IconBtn>
              </div>

              <div className="min-h-0 flex-1 overflow-y-auto">
                <div className="space-y-4 px-5 py-4">
                  <div>
                    <h2 className="text-[1.35rem] font-semibold leading-snug tracking-tight text-slate-900">
                      {selected.subject || "(no subject)"}
                    </h2>
                    <p className="mt-1 text-xs text-slate-400">1 message</p>
                  </div>

                  <div className="flex gap-3">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#6c47ff]/15 text-sm font-semibold text-[#6c47ff]">
                      {(selected.fromName || selected.from || "?")
                        .trim()
                        .charAt(0)
                        .toUpperCase()}
                    </div>
                    <div className="min-w-0 flex-1 text-[13px]">
                      <div className="font-semibold text-slate-900">
                        {selected.fromName || selected.from}
                        {selected.fromName ? (
                          <span className="ml-1 font-normal text-slate-500">
                            &lt;{selected.from}&gt;
                          </span>
                        ) : null}
                      </div>
                      <div className="mt-0.5 text-slate-500">
                        to {selected.to || "—"}
                        {selected.cc ? (
                          <span className="text-slate-400"> · cc {selected.cc}</span>
                        ) : null}
                      </div>
                      <div className="mt-0.5 text-xs text-slate-400">
                        {formatWhen(selected.dateMs || selected.date)}
                      </div>
                    </div>
                  </div>

                  {selected.attachments?.length ? (
                    <div className="flex flex-wrap gap-2">
                      {selected.attachments.map((att) => (
                        <button
                          key={`${att.index}-${att.filename}`}
                          type="button"
                          onClick={() =>
                            void downloadAttachment(selected, att.index, att.filename)
                          }
                          className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-left text-xs hover:bg-slate-100"
                        >
                          <Paperclip className="h-3.5 w-3.5 text-red-500" />
                          <span className="max-w-[180px] truncate font-medium text-slate-800">
                            {att.filename}
                          </span>
                          <span className="text-slate-400">{formatBytes(att.size)}</span>
                        </button>
                      ))}
                    </div>
                  ) : selected.hasAttachments ? (
                    <p className="text-xs text-slate-400">
                      Attachments detected — Sync again to load file details.
                    </p>
                  ) : null}

                  <div className="border-t border-slate-100 pt-4 text-[14px] text-slate-800">
                    {selectedBodyHtml ? (
                      <div
                        className="mailbox-html prose prose-sm max-w-none prose-a:text-[#6c47ff] prose-img:my-2 prose-img:inline-block prose-img:max-h-28 prose-img:max-w-[240px] prose-img:object-contain dark:prose-invert"
                        dangerouslySetInnerHTML={{ __html: selectedBodyHtml }}
                      />
                    ) : (
                      <pre className="whitespace-pre-wrap font-sans text-sm leading-relaxed">
                        {selected.textBody || selected.snippet || "(empty)"}
                      </pre>
                    )}
                  </div>
                </div>
              </div>

              <div className="flex shrink-0 flex-wrap gap-2 border-t border-slate-100 bg-white px-4 py-3">
                <Button
                  variant="outline"
                  className="h-9 rounded-full border-slate-200 px-4 text-slate-700 hover:bg-slate-50"
                  onClick={() => startCompose("reply", selected)}
                >
                  <Reply className="mr-2 h-4 w-4" />
                  Reply
                </Button>
                <Button
                  variant="outline"
                  className="h-9 rounded-full border-slate-200 px-4 text-slate-700 hover:bg-slate-50"
                  onClick={() => startCompose("replyAll", selected)}
                >
                  <ReplyAll className="mr-2 h-4 w-4" />
                  Reply all
                </Button>
                <Button
                  variant="outline"
                  className="h-9 rounded-full border-slate-200 px-4 text-slate-700 hover:bg-slate-50"
                  onClick={() => startCompose("forward", selected)}
                >
                  <Forward className="mr-2 h-4 w-4" />
                  Forward
                </Button>
              </div>
            </div>
          ) : (
            <div className="flex flex-1 flex-col items-center justify-center gap-3 p-8 text-center">
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-[#6c47ff]/10 text-[#6c47ff]">
                <Inbox className="h-7 w-7" />
              </div>
              <div>
                <p className="text-sm font-medium text-slate-800">No message selected</p>
                <p className="mt-1 text-xs text-slate-500">
                  Pick a conversation or start a new message.
                </p>
              </div>
              <Button
                className="mt-1 rounded-xl bg-[#6c47ff] hover:bg-[#5b38f0]"
                onClick={() => startCompose("new")}
              >
                <PenSquare className="mr-2 h-4 w-4" />
                New message
              </Button>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

function IconBtn({
  title,
  onClick,
  children,
}: {
  title: string;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      className="rounded-lg p-2 text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-800"
    >
      {children}
    </button>
  );
}
