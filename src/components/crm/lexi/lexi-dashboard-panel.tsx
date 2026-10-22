"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  Sparkles,
  Loader2,
  CheckCheck,
  Mail,
  MessageCircle,
  RefreshCw,
  Circle,
  CheckCircle2,
} from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import type { LexiMessage } from "@/lib/lexi/types";

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

/** Dashboard feed of Lexi → admin notices (chat lives in the floating button). */
export function LexiDashboardPanel() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [messages, setMessages] = useState<LexiMessage[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);

  const authHeaders = useCallback(async (): Promise<HeadersInit> => {
    if (!user) return {};
    const token = await user.getIdToken();
    const headers: HeadersInit = { Authorization: `Bearer ${token}` };
    const bypass = process.env.NEXT_PUBLIC_VERCEL_PROTECTION_BYPASS;
    if (bypass) headers["x-vercel-protection-bypass"] = bypass;
    return headers;
  }, [user]);

  const loadNotices = useCallback(async () => {
    if (!user) return;
    try {
      const headers = await authHeaders();
      const res = await fetch("/api/lexi/messages?limit=40", { headers });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Failed to load Lexi messages");
      setMessages(Array.isArray(data.messages) ? data.messages : []);
      setUnreadCount(Number(data.unreadCount || 0));
    } catch (error) {
      console.warn("[Lexi panel]", error);
    }
  }, [authHeaders, user]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      await loadNotices();
      if (!cancelled) setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [loadNotices]);

  const markRead = async (id: string, read = true) => {
    try {
      const headers = await authHeaders();
      const res = await fetch(`/api/lexi/messages/${encodeURIComponent(id)}/read`, {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({ read }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Update failed");
      setMessages((prev) =>
        prev.map((m) =>
          m.id === id
            ? { ...m, read, readAt: read ? new Date().toISOString() : null }
            : m
        )
      );
      setUnreadCount((c) => Math.max(0, read ? c - 1 : c + 1));
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Could not update message",
        description: error instanceof Error ? error.message : "Try again",
      });
    }
  };

  const markAllRead = async () => {
    try {
      const headers = await authHeaders();
      const res = await fetch("/api/lexi/messages", {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({ action: "mark_all_read" }),
      });
      if (!res.ok) throw new Error("Failed");
      await loadNotices();
      toast({ title: "All Lexi messages marked read" });
    } catch {
      toast({ variant: "destructive", title: "Could not mark all read" });
    }
  };

  const runLexi = async () => {
    setRunning(true);
    try {
      const headers = await authHeaders();
      const res = await fetch("/api/lexi/run", {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({ syncMail: true, draftMail: true, briefLeads: true }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Lexi run failed");
      await loadNotices();
      toast({
        title: "Lexi finished a pass",
        description: `Drafts: ${data.drafts?.drafted ?? 0} · Lead notes: ${data.briefing?.posted ?? 0}`,
      });
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Lexi run failed",
        description: error instanceof Error ? error.message : "Try again",
      });
    } finally {
      setRunning(false);
    }
  };

  const draftReady = messages.filter((m) => m.type === "draft_ready" && !m.read).length;
  const leadActions = messages.filter(
    (m) => (m.type === "lead_action" || m.type === "lead_suggestion") && !m.read
  ).length;

  return (
    <section className="relative overflow-hidden rounded-2xl border border-[#6c47ff]/20 bg-gradient-to-br from-[#f8f5ff] via-white to-[#f0f7ff] shadow-sm">
      <div className="pointer-events-none absolute -right-16 -top-16 h-40 w-40 rounded-full bg-[#6c47ff]/10 blur-2xl" />
      <div className="relative space-y-3 p-4 sm:p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[#6c47ff] text-white shadow-md shadow-[#6c47ff]/30">
              <Sparkles className="h-5 w-5" />
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="font-headline text-lg font-bold tracking-tight text-slate-900">
                  Lexi
                </h2>
                <Badge className="bg-[#6c47ff]/15 text-[#5b38f0] hover:bg-[#6c47ff]/15">
                  CRM assistant
                </Badge>
                {unreadCount > 0 ? (
                  <Badge variant="secondary">{unreadCount} unread</Badge>
                ) : null}
              </div>
              <p className="mt-0.5 max-w-xl text-sm text-slate-600">
                Notices for drafts, leads, and follow-ups. Chat anytime with the floating Lexi button
                (bottom-right). Auto-runs every 3 hours.
              </p>
              <div className="mt-2 flex flex-wrap gap-2 text-xs text-slate-500">
                <span className="inline-flex items-center gap-1 rounded-full bg-white/80 px-2.5 py-1 ring-1 ring-slate-200">
                  <Mail className="h-3 w-3 text-[#6c47ff]" />
                  {draftReady} draft{draftReady === 1 ? "" : "s"} ready
                </span>
                <span className="inline-flex items-center gap-1 rounded-full bg-white/80 px-2.5 py-1 ring-1 ring-slate-200">
                  <MessageCircle className="h-3 w-3 text-[#6c47ff]" />
                  {leadActions} lead tip{leadActions === 1 ? "" : "s"}
                </span>
              </div>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              variant="outline"
              className="border-[#6c47ff]/30"
              disabled={running || !user}
              onClick={() => void runLexi()}
            >
              {running ? (
                <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
              ) : (
                <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
              )}
              Run Lexi
            </Button>
            {unreadCount > 0 ? (
              <Button size="sm" variant="ghost" onClick={() => void markAllRead()}>
                <CheckCheck className="mr-1.5 h-3.5 w-3.5" />
                Mark all read
              </Button>
            ) : null}
          </div>
        </div>

        {loading ? (
          <div className="flex items-center justify-center gap-2 py-10 text-sm text-slate-500">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading Lexi…
          </div>
        ) : (
          <div className="max-h-[340px] space-y-2 overflow-y-auto rounded-xl bg-white/60 p-2 ring-1 ring-slate-100">
            {messages.length === 0 ? (
              <div className="px-3 py-8 text-center text-sm text-slate-500">
                No messages yet. Click <strong>Run Lexi</strong> to scan inbox drafts and leads — or
                open the floating chat button to talk with Lexi.
              </div>
            ) : (
              messages.map((msg) => (
                <article
                  key={msg.id}
                  className={cn(
                    "rounded-xl border px-3 py-2.5 transition-colors",
                    msg.read
                      ? "border-slate-100 bg-white/80"
                      : "border-[#6c47ff]/25 bg-[#f3efff]/80"
                  )}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        {!msg.read ? (
                          <Circle className="h-2 w-2 fill-[#6c47ff] text-[#6c47ff]" />
                        ) : (
                          <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
                        )}
                        <h3 className="truncate text-sm font-semibold text-slate-900">
                          {msg.title}
                        </h3>
                        <Badge variant="outline" className="text-[10px] capitalize">
                          {msg.type.replace(/_/g, " ")}
                        </Badge>
                      </div>
                      <p className="mt-1 whitespace-pre-wrap text-xs leading-relaxed text-slate-600">
                        {msg.body}
                      </p>
                      <div className="mt-1.5 flex flex-wrap items-center gap-2 text-[11px] text-slate-400">
                        <span>{formatWhen(msg.createdAtMs || msg.createdAt)}</span>
                        {msg.href ? (
                          <Link
                            href={msg.href}
                            className="font-medium text-[#6c47ff] hover:underline"
                          >
                            Open →
                          </Link>
                        ) : null}
                      </div>
                    </div>
                    <Button
                      size="sm"
                      variant={msg.read ? "ghost" : "outline"}
                      className="h-8 shrink-0 text-xs"
                      onClick={() => void markRead(msg.id, !msg.read)}
                    >
                      {msg.read ? "Unread" : "Mark read"}
                    </Button>
                  </div>
                </article>
              ))
            )}
          </div>
        )}
      </div>
    </section>
  );
}
