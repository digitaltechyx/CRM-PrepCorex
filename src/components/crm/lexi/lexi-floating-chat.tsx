"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Check, Eraser, Loader2, Send, Sparkles, X } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import type { LexiChatMessage } from "@/lib/lexi/types";
import type { LexiPendingAction } from "@/lib/lexi/actions";

function formatWhen(iso: string | number) {
  try {
    const d = typeof iso === "number" ? new Date(iso) : new Date(iso);
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

const WELCOME =
  "Hi, I'm Lexi — your PrepCorex CRM assistant. I can help with leads & pipeline, mailbox drafts, address book, quotes, invoices, and day-to-day priorities. Ask for counts, tips, or actions — I'll propose any CRM change for your Confirm before it runs.";

export function LexiFloatingChat() {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<LexiChatMessage[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [sending, setSending] = useState(false);
  const [pendingAction, setPendingAction] = useState<LexiPendingAction | null>(
    null
  );
  const [executing, setExecuting] = useState(false);
  const [clearing, setClearing] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const loadedRef = useRef(false);

  const authHeaders = useCallback(async (): Promise<HeadersInit> => {
    if (!user) return {};
    const token = await user.getIdToken();
    const headers: HeadersInit = { Authorization: `Bearer ${token}` };
    const bypass = process.env.NEXT_PUBLIC_VERCEL_PROTECTION_BYPASS;
    if (bypass) headers["x-vercel-protection-bypass"] = bypass;
    return headers;
  }, [user]);

  const scrollToBottom = useCallback(() => {
    requestAnimationFrame(() => {
      scrollRef.current?.scrollTo({
        top: scrollRef.current.scrollHeight,
        behavior: "smooth",
      });
    });
  }, []);

  const loadChat = useCallback(async () => {
    if (!user) return;
    setLoadingHistory(true);
    try {
      const headers = await authHeaders();
      const res = await fetch("/api/lexi/chat", { headers });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Failed to load chat");
      const rows: LexiChatMessage[] = Array.isArray(data.messages)
        ? data.messages
        : [];
      if (rows.length === 0) {
        setMessages([
          {
            id: "welcome",
            uid: user.uid,
            role: "assistant",
            content: WELCOME,
            createdAt: new Date().toISOString(),
            createdAtMs: Date.now(),
          },
        ]);
      } else {
        setMessages(rows);
      }
      scrollToBottom();
    } catch {
      setMessages([
        {
          id: "welcome-error",
          uid: user.uid,
          role: "assistant",
          content:
            "Hi — I'm Lexi. Chat history didn't load, but you can still message me anytime about leads, quotes, invoices, mailbox, or the address book.",
          createdAt: new Date().toISOString(),
          createdAtMs: Date.now(),
        },
      ]);
    } finally {
      setLoadingHistory(false);
    }
  }, [authHeaders, scrollToBottom, user]);

  useEffect(() => {
    if (!open || !user || loadedRef.current) return;
    loadedRef.current = true;
    void loadChat();
  }, [open, user, loadChat]);

  useEffect(() => {
    if (open) scrollToBottom();
  }, [messages, open, pendingAction, scrollToBottom]);

  const handleSend = async () => {
    const text = input.trim();
    if (!text || sending || !user) return;
    setSending(true);
    setInput("");
    setPendingAction(null);
    const optimistic: LexiChatMessage = {
      id: `local_${Date.now()}`,
      uid: user.uid,
      role: "user",
      content: text,
      createdAt: new Date().toISOString(),
      createdAtMs: Date.now(),
    };
    setMessages((prev) => [...prev, optimistic]);
    scrollToBottom();
    try {
      const headers = await authHeaders();
      const res = await fetch("/api/lexi/chat", {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({ message: text }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Lexi chat failed");
      if (data.reply) {
        setMessages((prev) => [
          ...prev.filter((m) => m.id !== optimistic.id),
          optimistic,
          data.reply as LexiChatMessage,
        ]);
      } else {
        await loadChat();
      }
      if (data.pendingAction?.type && data.pendingAction?.summary) {
        setPendingAction(data.pendingAction as LexiPendingAction);
      } else {
        setPendingAction(null);
      }
    } catch (error) {
      const msg =
        error instanceof Error ? error.message : "Lexi could not reply.";
      setMessages((prev) => [
        ...prev.filter((m) => m.id !== optimistic.id),
        {
          id: `err_${Date.now()}`,
          uid: user.uid,
          role: "assistant",
          content: `Sorry — ${msg}`,
          createdAt: new Date().toISOString(),
          createdAtMs: Date.now(),
        },
      ]);
      setInput(text);
    } finally {
      setSending(false);
    }
  };

  const welcomeMessage = useCallback((): LexiChatMessage => {
    return {
      id: "welcome",
      uid: user?.uid || "local",
      role: "assistant",
      content: WELCOME,
      createdAt: new Date().toISOString(),
      createdAtMs: Date.now(),
    };
  }, [user?.uid]);

  const clearChat = async () => {
    if (!user || clearing || sending) return;
    setClearing(true);
    setPendingAction(null);
    try {
      const headers = await authHeaders();
      const res = await fetch("/api/lexi/chat", {
        method: "DELETE",
        headers,
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Failed to clear chat");
      setMessages([welcomeMessage()]);
    } catch (error) {
      setMessages((prev) => [
        ...prev,
        {
          id: `clear_err_${Date.now()}`,
          uid: user.uid,
          role: "assistant",
          content: `Could not clear chat: ${
            error instanceof Error ? error.message : "Try again"
          }`,
          createdAt: new Date().toISOString(),
          createdAtMs: Date.now(),
        },
      ]);
    } finally {
      setClearing(false);
    }
  };

  const confirmAction = async () => {
    if (!pendingAction || !user || executing) return;
    setExecuting(true);
    try {
      const headers = await authHeaders();
      const res = await fetch("/api/lexi/execute", {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({ action: pendingAction }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Action failed");
      setPendingAction(null);
      setMessages((prev) => [
        ...prev,
        {
          id: `ok_${Date.now()}`,
          uid: user.uid,
          role: "assistant",
          content: `Done — ${data.message || "Action applied."}`,
          createdAt: new Date().toISOString(),
          createdAtMs: Date.now(),
        },
      ]);
    } catch (error) {
      setMessages((prev) => [
        ...prev,
        {
          id: `exec_err_${Date.now()}`,
          uid: user.uid,
          role: "assistant",
          content: `Could not apply that change: ${
            error instanceof Error ? error.message : "Try again"
          }`,
          createdAt: new Date().toISOString(),
          createdAtMs: Date.now(),
        },
      ]);
    } finally {
      setExecuting(false);
    }
  };

  if (!user) return null;

  return (
    <>
      {!open ? (
        <Button
          type="button"
          onClick={() => setOpen(true)}
          className="fixed bottom-5 right-4 z-50 h-14 w-14 rounded-full bg-[#6c47ff] p-0 shadow-lg hover:bg-[#5b38f0] sm:bottom-6 sm:right-6"
          aria-label="Open Lexi chat"
          title="Lexi · CRM assistant"
        >
          <Sparkles className="h-6 w-6 text-white" />
        </Button>
      ) : null}

      {open ? (
        <div className="fixed bottom-4 right-4 z-50 flex h-[min(560px,calc(100dvh-2rem))] w-[min(400px,calc(100vw-2rem))] flex-col overflow-hidden rounded-xl border bg-background shadow-2xl sm:bottom-6 sm:right-6">
          <div className="flex items-center justify-between border-b bg-[#6c47ff] px-4 py-3 text-white">
            <div className="flex min-w-0 items-center gap-2.5">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-white/15 ring-1 ring-white/20">
                <Sparkles className="h-5 w-5" />
              </div>
              <div className="min-w-0">
                <p className="font-semibold leading-tight">Lexi</p>
                <p className="mt-0.5 text-[11px] text-violet-100">
                  CRM assistant · PrepCorex
                </p>
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-0.5">
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-8 w-8 text-white hover:bg-[#5b38f0]"
                disabled={clearing || sending || loadingHistory}
                onClick={() => void clearChat()}
                title="Clear chat"
                aria-label="Clear chat"
              >
                {clearing ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Eraser className="h-4 w-4" />
                )}
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-8 w-8 text-white hover:bg-[#5b38f0]"
                onClick={() => setOpen(false)}
                title="Close"
                aria-label="Close Lexi chat"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          </div>

          <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto p-4">
            {loadingHistory ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                Loading chat…
              </div>
            ) : null}
            {messages.map((m) => (
              <div
                key={m.id}
                className={cn(
                  "max-w-[92%] rounded-lg px-3 py-2 text-sm whitespace-pre-wrap",
                  m.role === "user"
                    ? "ml-auto bg-[#6c47ff] text-white"
                    : "mr-auto bg-muted text-foreground"
                )}
              >
                {m.content}
                <div
                  className={cn(
                    "mt-1 text-[10px]",
                    m.role === "user" ? "text-white/70" : "text-muted-foreground"
                  )}
                >
                  {formatWhen(m.createdAtMs || m.createdAt)}
                </div>
              </div>
            ))}
            {pendingAction ? (
              <div className="mr-auto max-w-[92%] rounded-lg border border-[#6c47ff]/30 bg-[#f3efff] px-3 py-2.5 text-sm">
                <p className="font-medium text-slate-900">Needs your approval</p>
                <p className="mt-1 text-slate-700">{pendingAction.summary}</p>
                <p className="mt-1 text-[11px] text-muted-foreground">
                  Type: {pendingAction.type}
                </p>
                <div className="mt-2.5 flex gap-2">
                  <Button
                    type="button"
                    size="sm"
                    className="bg-[#6c47ff] hover:bg-[#5b38f0]"
                    disabled={executing}
                    onClick={() => void confirmAction()}
                  >
                    {executing ? (
                      <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Check className="mr-1.5 h-3.5 w-3.5" />
                    )}
                    Confirm
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={executing}
                    onClick={() => setPendingAction(null)}
                  >
                    Cancel
                  </Button>
                </div>
              </div>
            ) : null}
            {sending ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                Lexi is thinking…
              </div>
            ) : null}
          </div>

          <div className="border-t p-3">
            <div className="flex gap-2">
              <Textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="Ask about leads, quotes, invoices, address book…"
                rows={2}
                className="min-h-[44px] resize-none"
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    void handleSend();
                  }
                }}
              />
              <Button
                type="button"
                size="icon"
                className="shrink-0 bg-[#6c47ff] hover:bg-[#5b38f0]"
                disabled={sending || !input.trim()}
                onClick={() => void handleSend()}
              >
                <Send className="h-4 w-4" />
              </Button>
            </div>
            <p className="mt-2 text-center text-[10px] text-muted-foreground">
              Lexi proposes CRM changes — you Confirm before they run
            </p>
          </div>
        </div>
      ) : null}
    </>
  );
}
