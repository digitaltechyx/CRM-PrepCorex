"use client";

import { useRef, useState, type ReactNode } from "react";
import {
  Send,
  FileEdit,
  Loader2,
  ArrowLeft,
  Paperclip,
  Link2,
  ImagePlus,
  Clock,
  Bold,
  Italic,
  Underline,
  PenLine,
  Trash2,
  ChevronUp,
  Type,
  Eye,
  FileText,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  MAILBOX_SIGNATURE_PLAIN,
  messageHasSignature,
} from "@/lib/mailbox-signature";
import { cn } from "@/lib/utils";

export type ComposeMode = "new" | "reply" | "replyAll" | "forward";

export type ComposeAttachment = {
  filename: string;
  contentBase64: string;
  size: number;
};

type Props = {
  mode: ComposeMode;
  to: string;
  cc: string;
  subject: string;
  message: string;
  sending: boolean;
  onChange: (patch: Partial<{ to: string; cc: string; subject: string; message: string }>) => void;
  onBack: () => void;
  onSend: (opts: {
    draft?: boolean;
    scheduledFor?: string;
    attachments: ComposeAttachment[];
    includeSignature: boolean;
  }) => void;
};

function formatBytes(size: number) {
  if (!size || size < 1024) return `${size || 0} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(0)} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

function njNineAm(daysAhead: number): Date {
  // Build a date at 09:00 America/New_York
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const base = new Date(Date.now() + daysAhead * 24 * 60 * 60 * 1000);
  const parts = formatter.formatToParts(base);
  const y = parts.find((p) => p.type === "year")?.value;
  const m = parts.find((p) => p.type === "month")?.value;
  const d = parts.find((p) => p.type === "day")?.value;
  // Approximate: treat as UTC-4/5 via Date parse with offset guess — use noon UTC then adjust
  // Simpler reliable approach: set local components from NJ calendar date + 9:00 EST/EDT via temporal string
  const guess = new Date(`${y}-${m}-${d}T09:00:00`);
  // Correct for NJ by comparing formatted hour
  for (let offsetMin = -300; offsetMin <= -240; offsetMin += 60) {
    const candidate = new Date(`${y}-${m}-${d}T09:00:00${offsetMin === -240 ? "-04:00" : "-05:00"}`);
    const hourNj = Number(
      new Intl.DateTimeFormat("en-US", {
        timeZone: "America/New_York",
        hour: "numeric",
        hour12: false,
      }).format(candidate)
    );
    if (hourNj === 9) return candidate;
  }
  return guess;
}

function daysUntilNextMonday(): number {
  const nowNj = new Date(
    new Date().toLocaleString("en-US", { timeZone: "America/New_York" })
  );
  const day = nowNj.getDay(); // 0 Sun
  const days = (8 - day) % 7 || 7;
  return days;
}

async function fileToAttachment(file: File): Promise<ComposeAttachment> {
  const buf = await file.arrayBuffer();
  const bytes = new Uint8Array(buf);
  let binary = "";
  for (let i = 0; i < bytes.length; i += 1) binary += String.fromCharCode(bytes[i]!);
  return {
    filename: file.name,
    contentBase64: btoa(binary),
    size: file.size,
  };
}

function wrapSelection(
  textarea: HTMLTextAreaElement | null,
  value: string,
  before: string,
  after: string,
  onChange: (next: string) => void
) {
  if (!textarea) {
    onChange(`${value}${before}${after}`);
    return;
  }
  const start = textarea.selectionStart;
  const end = textarea.selectionEnd;
  const selected = value.slice(start, end) || "text";
  const next = value.slice(0, start) + before + selected + after + value.slice(end);
  onChange(next);
  requestAnimationFrame(() => {
    textarea.focus();
    const cursor = start + before.length + selected.length + after.length;
    textarea.setSelectionRange(cursor, cursor);
  });
}

export function MailboxCompose({
  mode,
  to,
  cc,
  subject,
  message,
  sending,
  onChange,
  onBack,
  onSend,
}: Props) {
  const bodyRef = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const imageRef = useRef<HTMLInputElement>(null);
  const [attachments, setAttachments] = useState<ComposeAttachment[]>([]);
  const [includeSignature, setIncludeSignature] = useState(true);
  const [showFormat, setShowFormat] = useState(false);
  const [customScheduleOpen, setCustomScheduleOpen] = useState(false);
  const [customWhen, setCustomWhen] = useState("");

  const title =
    mode === "new"
      ? "New message"
      : mode === "replyAll"
        ? "Reply all"
        : mode === "reply"
          ? "Reply"
          : "Forward";

  const insertSignature = () => {
    if (messageHasSignature(message)) return;
    onChange({
      message: message.trim()
        ? `${message.replace(/\s+$/, "")}\n\n${MAILBOX_SIGNATURE_PLAIN}`
        : MAILBOX_SIGNATURE_PLAIN,
    });
    setIncludeSignature(true);
  };

  const insertLink = () => {
    const url = window.prompt("Link URL", "https://");
    if (!url) return;
    const label = window.prompt("Link text", url) || url;
    wrapSelection(bodyRef.current, message, `[${label}](`, `${url})`, (next) =>
      onChange({ message: next })
    );
  };

  const addFiles = async (files: FileList | null) => {
    if (!files?.length) return;
    const next: ComposeAttachment[] = [];
    for (const file of Array.from(files)) {
      if (file.size > 8 * 1024 * 1024) continue;
      next.push(await fileToAttachment(file));
    }
    setAttachments((prev) => [...prev, ...next].slice(0, 10));
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex shrink-0 items-center justify-between border-b px-4 py-2">
        <h2 className="font-medium">{title}</h2>
        <Button variant="ghost" size="sm" onClick={onBack}>
          <ArrowLeft className="mr-1 h-4 w-4" />
          Back
        </Button>
      </div>

      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-4">
        <div className="space-y-1">
          <Label htmlFor="mail-to">Recipients</Label>
          <Input
            id="mail-to"
            value={to}
            onChange={(e) => onChange({ to: e.target.value })}
            placeholder="client@example.com"
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="mail-cc">Cc</Label>
          <Input
            id="mail-cc"
            value={cc}
            onChange={(e) => onChange({ cc: e.target.value })}
            placeholder="optional@example.com"
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="mail-subject">Subject</Label>
          <Input
            id="mail-subject"
            value={subject}
            onChange={(e) => onChange({ subject: e.target.value })}
          />
        </div>
        <div className="flex min-h-[220px] flex-1 flex-col space-y-1">
          <Label htmlFor="mail-body">Message</Label>
          <Textarea
            ref={bodyRef}
            id="mail-body"
            className="min-h-[260px] flex-1 font-sans"
            value={message}
            onChange={(e) => onChange({ message: e.target.value })}
            placeholder="Write your message…"
          />
        </div>

        {attachments.length > 0 ? (
          <div className="flex flex-wrap gap-2">
            {attachments.map((att, i) => (
              <div
                key={`${att.filename}-${i}`}
                className="inline-flex items-center gap-2 rounded-lg border px-2.5 py-1.5 text-xs"
              >
                <Paperclip className="h-3.5 w-3.5" />
                <span className="max-w-[160px] truncate">{att.filename}</span>
                <span className="text-muted-foreground">{formatBytes(att.size)}</span>
                <button
                  type="button"
                  className="text-muted-foreground hover:text-destructive"
                  onClick={() =>
                    setAttachments((prev) => prev.filter((_, idx) => idx !== i))
                  }
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
          </div>
        ) : null}
      </div>

      <TooltipProvider delayDuration={200}>
        <div className="flex shrink-0 flex-wrap items-center gap-1 border-t bg-card px-3 py-2">
          <div className="flex items-center">
            <Button
              className="rounded-r-none bg-[#6c47ff] hover:bg-[#5b38f0]"
              disabled={sending}
              onClick={() =>
                onSend({ attachments, includeSignature })
              }
            >
              {sending ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Send className="mr-2 h-4 w-4" />
              )}
              Send
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  className="rounded-l-none border-l border-[#5b38f0] bg-[#6c47ff] px-2 hover:bg-[#5b38f0]"
                  disabled={sending}
                >
                  <ChevronUp className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-56">
                <div className="px-2 py-1.5 text-sm font-semibold">Schedule message</div>
                <DropdownMenuItem
                  onClick={() =>
                    onSend({
                      attachments,
                      includeSignature,
                      scheduledFor: njNineAm(1).toISOString(),
                    })
                  }
                >
                  Tomorrow at 9:00 AM
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() =>
                    onSend({
                      attachments,
                      includeSignature,
                      scheduledFor: njNineAm(daysUntilNextMonday()).toISOString(),
                    })
                  }
                >
                  Monday at 9:00 AM
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setCustomScheduleOpen(true)}>
                  Custom time and date
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>

          <Popover open={customScheduleOpen} onOpenChange={setCustomScheduleOpen}>
            <PopoverTrigger asChild>
              <span className="sr-only">Custom schedule</span>
            </PopoverTrigger>
            <PopoverContent className="w-72 space-y-2" align="start">
              <div className="text-sm font-semibold">Custom time and date</div>
              <Input
                type="datetime-local"
                value={customWhen}
                onChange={(e) => setCustomWhen(e.target.value)}
              />
              <Button
                size="sm"
                className="w-full"
                disabled={!customWhen || sending}
                onClick={() => {
                  const when = new Date(customWhen);
                  if (Number.isNaN(when.getTime())) return;
                  setCustomScheduleOpen(false);
                  onSend({
                    attachments,
                    includeSignature,
                    scheduledFor: when.toISOString(),
                  });
                }}
              >
                Schedule
              </Button>
            </PopoverContent>
          </Popover>

          <ToolIcon
            label="Schedule"
            onClick={() => setCustomScheduleOpen(true)}
            icon={<Clock className="h-4 w-4" />}
          />
          <ToolIcon
            label="Formatting"
            active={showFormat}
            onClick={() => setShowFormat((v) => !v)}
            icon={<Type className="h-4 w-4" />}
          />
          <ToolIcon
            label="Attach files"
            onClick={() => fileRef.current?.click()}
            icon={<Paperclip className="h-4 w-4" />}
          />
          <ToolIcon
            label="Insert link"
            onClick={insertLink}
            icon={<Link2 className="h-4 w-4" />}
          />
          <ToolIcon
            label="Insert image"
            onClick={() => imageRef.current?.click()}
            icon={<ImagePlus className="h-4 w-4" />}
          />

          <span className="mx-1 hidden h-5 w-px bg-border sm:block" />

          <ToolIcon
            label="Preview (coming soon)"
            onClick={() => undefined}
            icon={<Eye className="h-4 w-4" />}
            disabled
          />
          <ToolIcon
            label="Templates (coming soon)"
            onClick={() => undefined}
            icon={<FileText className="h-4 w-4" />}
            disabled
          />
          <ToolIcon
            label={includeSignature ? "Signature on" : "Insert signature"}
            active={includeSignature}
            onClick={() => {
              setIncludeSignature(true);
              insertSignature();
            }}
            icon={<PenLine className="h-4 w-4" />}
          />

          <div className="ml-auto flex items-center gap-1">
            <Button
              variant="ghost"
              size="sm"
              disabled={sending}
              onClick={() => onSend({ draft: true, attachments, includeSignature })}
            >
              <FileEdit className="mr-1 h-4 w-4" />
              Save draft
            </Button>
            <Button variant="ghost" size="icon" title="Discard" onClick={onBack}>
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>

          {showFormat ? (
            <div className="flex w-full gap-1 border-t pt-2">
              <Button
                size="sm"
                variant="outline"
                onClick={() =>
                  wrapSelection(bodyRef.current, message, "**", "**", (next) =>
                    onChange({ message: next })
                  )
                }
              >
                <Bold className="h-3.5 w-3.5" />
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() =>
                  wrapSelection(bodyRef.current, message, "_", "_", (next) =>
                    onChange({ message: next })
                  )
                }
              >
                <Italic className="h-3.5 w-3.5" />
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() =>
                  wrapSelection(bodyRef.current, message, "__", "__", (next) =>
                    onChange({ message: next })
                  )
                }
              >
                <Underline className="h-3.5 w-3.5" />
              </Button>
            </div>
          ) : null}
        </div>
      </TooltipProvider>

      <input
        ref={fileRef}
        type="file"
        className="hidden"
        multiple
        onChange={(e) => {
          void addFiles(e.target.files);
          e.target.value = "";
        }}
      />
      <input
        ref={imageRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          void addFiles(e.target.files);
          e.target.value = "";
        }}
      />
    </div>
  );
}

function ToolIcon({
  label,
  icon,
  onClick,
  active,
  disabled,
}: {
  label: string;
  icon: ReactNode;
  onClick: () => void;
  active?: boolean;
  disabled?: boolean;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          type="button"
          size="icon"
          variant="ghost"
          disabled={disabled}
          className={cn("h-8 w-8", active && "bg-[#f3efff] text-[#6c47ff]")}
          onClick={onClick}
        >
          {icon}
        </Button>
      </TooltipTrigger>
      <TooltipContent side="top">{label}</TooltipContent>
    </Tooltip>
  );
}
