"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Inbox,
  Send,
  FileEdit,
  ShieldAlert,
  RefreshCw,
  PenSquare,
  Loader2,
  ArrowLeft,
  Trash2,
} from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  MAILBOX_FOLDERS,
  type CrmMailboxMessage,
  type MailboxFolderKey,
} from "@/lib/mailbox-types";

const folderIcons: Record<MailboxFolderKey, typeof Inbox> = {
  inbox: Inbox,
  sent: Send,
  drafts: FileEdit,
  spam: ShieldAlert,
};

function formatWhen(isoOrMs: string | number) {
  try {
    const d = typeof isoOrMs === "number" ? new Date(isoOrMs) : new Date(isoOrMs);
    if (Number.isNaN(d.getTime())) return "";
    return d.toLocaleString(undefined, {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  } catch {
    return "";
  }
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
  const [sending, setSending] = useState(false);
  const [compose, setCompose] = useState({ to: "", subject: "", message: "" });

  const authHeaders = useCallback(async (): Promise<HeadersInit> => {
    if (!user) return {};
    const token = await user.getIdToken();
    const headers: HeadersInit = { Authorization: `Bearer ${token}` };
    const bypass = process.env.NEXT_PUBLIC_VERCEL_PROTECTION_BYPASS;
    if (bypass) headers["x-vercel-protection-bypass"] = bypass;
    return headers;
  }, [user]);

  const loadMessages = useCallback(
    async (nextFolder: MailboxFolderKey = folder) => {
      if (!user) return;
      setLoading(true);
      try {
        const headers = await authHeaders();
        const res = await fetch(`/api/mailbox/messages?folder=${nextFolder}&limit=80`, {
          headers,
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || "Failed to load messages");
        setMailboxEmail(String(data.mailboxEmail || mailboxEmail));
        setMessages(Array.isArray(data.messages) ? data.messages : []);
      } catch (error) {
        toast({
          variant: "destructive",
          title: "Could not load mailbox",
          description: error instanceof Error ? error.message : "Try sync again.",
        });
      } finally {
        setLoading(false);
      }
    },
    [authHeaders, folder, mailboxEmail, toast, user]
  );

  const syncMailbox = useCallback(async () => {
    if (!user) return;
    setSyncing(true);
    try {
      const headers = await authHeaders();
      const res = await fetch("/api/mailbox/sync", {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({ folders: ["inbox", "sent", "drafts", "spam"], limit: 40 }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Sync failed");
      const summary = (data.folders || [])
        .map((f: { folder: string; synced: number; error?: string }) =>
          f.error ? `${f.folder}: error` : `${f.folder}: ${f.synced}`
        )
        .join(" · ");
      toast({ title: "Mailbox synced", description: summary || "Done" });
      await loadMessages(folder);
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Sync failed",
        description: error instanceof Error ? error.message : "Try again.",
      });
    } finally {
      setSyncing(false);
    }
  }, [authHeaders, folder, loadMessages, toast, user]);

  useEffect(() => {
    void loadMessages(folder);
  }, [folder]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    // Auto-sync once when opening mailbox
    void syncMailbox();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const openMessage = async (msg: CrmMailboxMessage) => {
    setComposing(false);
    setSelectedId(msg.id);
    setSelected(msg);
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
      /* keep list preview */
    }
  };

  const moveSelected = async (targetFolder: MailboxFolderKey) => {
    if (!selected) return;
    try {
      const headers = await authHeaders();
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
      toast({ title: `Moved to ${targetFolder}` });
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

  const submitCompose = async (asDraft: boolean) => {
    if (!compose.to.trim()) {
      toast({ variant: "destructive", title: "Add a recipient." });
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
          subject: compose.subject.trim(),
          message: compose.message,
          draft: asDraft,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Send failed");
      toast({
        title: asDraft ? "Draft saved" : "Email sent",
        description: asDraft
          ? "Saved to Hostinger Drafts and CRM."
          : "Also copied to Hostinger Sent.",
      });
      setCompose({ to: "", subject: "", message: "" });
      setComposing(false);
      setFolder(asDraft ? "drafts" : "sent");
      await loadMessages(asDraft ? "drafts" : "sent");
    } catch (error) {
      toast({
        variant: "destructive",
        title: asDraft ? "Draft failed" : "Send failed",
        description: error instanceof Error ? error.message : "Try again.",
      });
    } finally {
      setSending(false);
    }
  };

  const selectedBodyHtml = useMemo(() => {
    if (!selected?.htmlBody) return null;
    return selected.htmlBody;
  }, [selected]);

  return (
    <div className="flex h-[calc(100dvh-5.5rem)] min-h-[520px] flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Mailbox</h1>
          <p className="text-sm text-muted-foreground">
            {mailboxEmail} · synced with Hostinger
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={syncing || !user}
            onClick={() => void syncMailbox()}
          >
            {syncing ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="mr-2 h-4 w-4" />
            )}
            Sync
          </Button>
          <Button
            size="sm"
            onClick={() => {
              setComposing(true);
              setSelected(null);
              setSelectedId(null);
            }}
          >
            <PenSquare className="mr-2 h-4 w-4" />
            Compose
          </Button>
        </div>
      </div>

      <div className="grid min-h-0 flex-1 gap-3 md:grid-cols-[180px_minmax(0,1fr)_minmax(0,1.2fr)]">
        {/* Folders */}
        <aside className="rounded-xl border bg-card p-2">
          <nav className="flex flex-col gap-1">
            {MAILBOX_FOLDERS.map((f) => {
              const Icon = folderIcons[f.key];
              const active = folder === f.key && !composing;
              return (
                <button
                  key={f.key}
                  type="button"
                  className={cn(
                    "flex items-center gap-2 rounded-lg px-3 py-2 text-left text-sm font-medium transition-colors",
                    active
                      ? "bg-primary/10 text-primary"
                      : "text-muted-foreground hover:bg-muted hover:text-foreground"
                  )}
                  onClick={() => {
                    setFolder(f.key);
                    setComposing(false);
                    setSelected(null);
                    setSelectedId(null);
                  }}
                >
                  <Icon className="h-4 w-4 shrink-0" />
                  {f.label}
                </button>
              );
            })}
          </nav>
        </aside>

        {/* List */}
        <section className="flex min-h-0 flex-col overflow-hidden rounded-xl border bg-card">
          <div className="border-b px-3 py-2 text-sm font-medium capitalize">
            {composing ? "Compose" : folder}
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto">
            {loading ? (
              <div className="flex items-center justify-center gap-2 p-8 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                Loading…
              </div>
            ) : composing ? (
              <div className="p-3 text-sm text-muted-foreground">
                New message — fill the form on the right.
              </div>
            ) : messages.length === 0 ? (
              <div className="p-6 text-sm text-muted-foreground">
                No messages yet. Click Sync to pull from Hostinger.
              </div>
            ) : (
              messages.map((msg) => (
                <button
                  key={msg.id}
                  type="button"
                  onClick={() => void openMessage(msg)}
                  className={cn(
                    "block w-full border-b px-3 py-2.5 text-left transition-colors hover:bg-muted/60",
                    selectedId === msg.id && "bg-muted",
                    !msg.seen && "bg-primary/[0.04]"
                  )}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className={cn("truncate text-sm", !msg.seen && "font-semibold")}>
                      {folder === "sent" || folder === "drafts"
                        ? msg.to || "(no recipient)"
                        : msg.fromName || msg.from}
                    </div>
                    <div className="shrink-0 text-[11px] text-muted-foreground">
                      {formatWhen(msg.dateMs || msg.date)}
                    </div>
                  </div>
                  <div className={cn("truncate text-sm", !msg.seen && "font-medium")}>
                    {msg.subject}
                  </div>
                  <div className="truncate text-xs text-muted-foreground">{msg.snippet}</div>
                </button>
              ))
            )}
          </div>
        </section>

        {/* Reader / Compose */}
        <section className="flex min-h-0 flex-col overflow-hidden rounded-xl border bg-card">
          {composing ? (
            <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-4">
              <div className="flex items-center justify-between">
                <h2 className="font-medium">New message</h2>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setComposing(false)}
                >
                  <ArrowLeft className="mr-1 h-4 w-4" />
                  Back
                </Button>
              </div>
              <div className="space-y-1">
                <Label htmlFor="mail-to">To</Label>
                <Input
                  id="mail-to"
                  value={compose.to}
                  onChange={(e) => setCompose((p) => ({ ...p, to: e.target.value }))}
                  placeholder="client@example.com"
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="mail-subject">Subject</Label>
                <Input
                  id="mail-subject"
                  value={compose.subject}
                  onChange={(e) =>
                    setCompose((p) => ({ ...p, subject: e.target.value }))
                  }
                />
              </div>
              <div className="flex min-h-0 flex-1 flex-col space-y-1">
                <Label htmlFor="mail-body">Message</Label>
                <Textarea
                  id="mail-body"
                  className="min-h-[220px] flex-1"
                  value={compose.message}
                  onChange={(e) =>
                    setCompose((p) => ({ ...p, message: e.target.value }))
                  }
                />
              </div>
              <div className="flex flex-wrap gap-2">
                <Button disabled={sending} onClick={() => void submitCompose(false)}>
                  {sending ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <Send className="mr-2 h-4 w-4" />
                  )}
                  Send
                </Button>
                <Button
                  variant="outline"
                  disabled={sending}
                  onClick={() => void submitCompose(true)}
                >
                  <FileEdit className="mr-2 h-4 w-4" />
                  Save draft
                </Button>
              </div>
            </div>
          ) : selected ? (
            <div className="flex min-h-0 flex-1 flex-col">
              <div className="space-y-1 border-b p-4">
                <div className="text-base font-semibold">{selected.subject}</div>
                <div className="text-sm text-muted-foreground">
                  From: {selected.fromName ? `${selected.fromName} <${selected.from}>` : selected.from}
                </div>
                <div className="text-sm text-muted-foreground">To: {selected.to || "—"}</div>
                <div className="text-xs text-muted-foreground">
                  {formatWhen(selected.dateMs || selected.date)}
                </div>
                <div className="flex flex-wrap gap-2 pt-2">
                  {folder !== "spam" ? (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => void moveSelected("spam")}
                    >
                      <ShieldAlert className="mr-1 h-4 w-4" />
                      Spam
                    </Button>
                  ) : (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => void moveSelected("inbox")}
                    >
                      <Inbox className="mr-1 h-4 w-4" />
                      Not spam
                    </Button>
                  )}
                  {folder === "inbox" ? (
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => {
                        setComposing(true);
                        setCompose({
                          to: selected.from,
                          subject: selected.subject.startsWith("Re:")
                            ? selected.subject
                            : `Re: ${selected.subject}`,
                          message: `\n\n---\nOn ${formatWhen(selected.dateMs || selected.date)}, ${selected.from} wrote:\n${selected.textBody || selected.snippet || ""}`,
                        });
                      }}
                    >
                      Reply
                    </Button>
                  ) : null}
                  <Button
                    size="sm"
                    variant="ghost"
                    className="text-destructive"
                    onClick={() => void moveSelected("spam")}
                    title="Move to spam"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
              <div className="min-h-0 flex-1 overflow-y-auto p-4 text-sm">
                {selectedBodyHtml ? (
                  <div
                    className="prose prose-sm max-w-none dark:prose-invert"
                    dangerouslySetInnerHTML={{ __html: selectedBodyHtml }}
                  />
                ) : (
                  <pre className="whitespace-pre-wrap font-sans text-sm">
                    {selected.textBody || selected.snippet || "(empty)"}
                  </pre>
                )}
              </div>
            </div>
          ) : (
            <div className="flex flex-1 items-center justify-center p-6 text-sm text-muted-foreground">
              Select a message or compose a new one.
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
