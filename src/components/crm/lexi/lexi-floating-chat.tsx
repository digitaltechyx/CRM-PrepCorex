"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Loader2, Send, Sparkles, X } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import type { LexiChatMessage } from "@/lib/lexi/types";

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

export function LexiFloatingChat() {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<LexiChatMessage[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [sending, setSending] = useState(false);
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
            content:
              "Hi, I'm Lexi — your PrepCorex CRM assistant. Ask me about leads, follow-ups, email drafts, quotes, or anything else. I'll coach you and keep work in Drafts for your review before send.",
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
            "Hi — I'm Lexi. Chat history didn't load, but you can still message me anytime.",
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
  }, [messages, open, scrollToBottom]);

  const handleSend = async () => {
    const text = input.trim();
    if (!text || sending || !user) return;
    setSending(true);
    setInput("");
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
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-white hover:bg-[#5b38f0]"
              onClick={() => setOpen(false)}
            >
              <X className="h-4 w-4" />
            </Button>
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
                placeholder="Ask Lexi about leads, drafts, follow-ups…"
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
              Lexi · PrepCorex CRM
            </p>
          </div>
        </div>
      ) : null}
    </>
  );
}
