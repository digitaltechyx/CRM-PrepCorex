"use client";

import { useEffect, useMemo, useState } from "react";
import QRCode from "qrcode";
import {
  Download,
  Linkedin,
  Loader2,
  Mail,
  MapPin,
  MessageCircle,
  Phone,
  Share2,
  UserPlus,
  X,
} from "lucide-react";
import {
  B_CARD_PROFILE,
  bCardWhatsAppUrl,
  buildBCardVCard,
} from "@/lib/b-card-profile";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type SheetMode = "actions" | "share-form" | null;

function FacebookIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M14 8h2V5h-2c-2.2 0-4 1.8-4 4v2H8v3h2v7h3v-7h2.2l.8-3H13V9c0-.6.4-1 1-1z" />
    </svg>
  );
}

function InstagramIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M7 2h10a5 5 0 0 1 5 5v10a5 5 0 0 1-5 5H7a5 5 0 0 1-5-5V7a5 5 0 0 1 5-5zm10 2H7a3 3 0 0 0-3 3v10a3 3 0 0 0 3 3h10a3 3 0 0 0 3-3V7a3 3 0 0 0-3-3zm-5 3.5A4.5 4.5 0 1 1 7.5 12 4.5 4.5 0 0 1 12 7.5zm0 2A2.5 2.5 0 1 0 14.5 12 2.5 2.5 0 0 0 12 9.5zm5.25-3.75a1 1 0 1 1-1 1 1 1 0 0 1 1-1z" />
    </svg>
  );
}

function TikTokIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-2.88 2.5 2.89 2.89 0 0 1-2.89-2.89 2.89 2.89 0 0 1 2.89-2.89c.28 0 .55.04.81.1v-3.5a6.37 6.37 0 0 0-.81-.05A6.34 6.34 0 0 0 3.16 15.28 6.34 6.34 0 0 0 9.5 21.62a6.34 6.34 0 0 0 6.34-6.34V8.87a8.2 8.2 0 0 0 4.76 1.52V6.94a4.85 4.85 0 0 1-1.01-.25z" />
    </svg>
  );
}

function socialIcon(id: string) {
  if (id === "linkedin") return Linkedin;
  if (id === "facebook") return FacebookIcon;
  if (id === "instagram") return InstagramIcon;
  return TikTokIcon;
}

export function DigitalBusinessCard() {
  const { toast } = useToast();
  const [cardUrl, setCardUrl] = useState("https://crm.prepservicesfba.com/b-card");
  const [qrDataUrl, setQrDataUrl] = useState<string>("");
  const [sheet, setSheet] = useState<SheetMode>("actions");
  const [savingLead, setSavingLead] = useState(false);
  const [lead, setLead] = useState({
    name: "",
    phone: "",
    email: "",
    company: "",
  });

  useEffect(() => {
    if (typeof window === "undefined") return;
    const url = `${window.location.origin}/b-card`;
    setCardUrl(url);
    void QRCode.toDataURL(url, {
      width: 280,
      margin: 1,
      color: { dark: "#1a1208", light: "#ffffff" },
    }).then(setQrDataUrl);
  }, []);

  const whatsappUrl = useMemo(() => bCardWhatsAppUrl(), []);

  const downloadVCard = () => {
    const blob = new Blob([buildBCardVCard()], {
      type: "text/vcard;charset=utf-8",
    });
    const href = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = href;
    a.download = "Arshad-Iqbal-Prep-Services-FBA.vcf";
    a.click();
    URL.revokeObjectURL(href);
    toast({
      title: "Contact ready",
      description: "Save Arshad Iqbal to your phone contacts.",
    });
  };

  const shareCard = async () => {
    const payload = {
      title: `${B_CARD_PROFILE.name} · ${B_CARD_PROFILE.company}`,
      text: `${B_CARD_PROFILE.title} — ${B_CARD_PROFILE.tagline}`,
      url: cardUrl,
    };
    try {
      if (navigator.share) {
        await navigator.share(payload);
        return;
      }
      await navigator.clipboard.writeText(cardUrl);
      toast({
        title: "Link copied",
        description: "Digital card link copied — paste it anywhere.",
      });
    } catch (err: unknown) {
      if (err instanceof Error && err.name === "AbortError") return;
      try {
        await navigator.clipboard.writeText(cardUrl);
        toast({ title: "Link copied", description: cardUrl });
      } catch {
        toast({
          variant: "destructive",
          title: "Could not share",
          description: "Copy this link manually: " + cardUrl,
        });
      }
    }
  };

  const openWhatsApp = () => {
    window.open(whatsappUrl, "_blank", "noopener,noreferrer");
  };

  const pickContactFromPhone = async () => {
    const contacts = (navigator as Navigator & {
      contacts?: {
        select: (
          props: string[],
          opts?: { multiple?: boolean }
        ) => Promise<Array<Record<string, string[]>>>;
      };
    }).contacts;

    if (!contacts?.select) {
      setSheet("share-form");
      return;
    }

    try {
      const selected = await contacts.select(["name", "email", "tel"], {
        multiple: false,
      });
      const row = selected?.[0];
      if (!row) return;
      setLead({
        name: row.name?.[0] || "",
        phone: row.tel?.[0] || "",
        email: row.email?.[0] || "",
        company: "",
      });
      setSheet("share-form");
    } catch {
      setSheet("share-form");
    }
  };

  const submitLead = async () => {
    setSavingLead(true);
    try {
      const res = await fetch("/api/b-card/leads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...lead, source: "form" }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(data.error || "Could not save.");
      toast({
        title: "Thanks — contact saved",
        description: "Your details were added to our CRM address book.",
      });
      setLead({ name: "", phone: "", email: "", company: "" });
      setSheet(null);
    } catch (err: unknown) {
      toast({
        variant: "destructive",
        title: "Could not save contact",
        description: err instanceof Error ? err.message : "Try again.",
      });
    } finally {
      setSavingLead(false);
    }
  };

  return (
    <div className="min-h-[100dvh] bg-[#f4f1ec] text-slate-900">
      <div className="mx-auto flex min-h-[100dvh] w-full max-w-md flex-col overflow-hidden bg-white shadow-2xl shadow-orange-900/10">
        {/* Orange header */}
        <header className="relative overflow-hidden bg-gradient-to-br from-[#ff6a1a] via-[#ff4d12] to-[#e03d00] px-5 pb-8 pt-6 text-white">
          <div
            aria-hidden
            className="pointer-events-none absolute -right-10 -top-10 h-40 w-40 rounded-full bg-white/15 blur-2xl"
          />
          <div className="relative flex items-center justify-between gap-3">
            <div className="flex h-14 max-w-[48%] items-center rounded-xl bg-black/25 px-2.5 py-1.5 ring-1 ring-white/20">
              <img
                src={B_CARD_PROFILE.companyLogoSrc}
                alt="Prep Services FBA"
                className="h-10 w-auto max-w-full object-contain"
              />
            </div>
            <div className="flex h-14 max-w-[48%] items-center rounded-xl bg-white px-2.5 py-1.5 shadow-sm">
              <img
                src={B_CARD_PROFILE.prepcorexLogoSrc}
                alt="PrepCorex"
                className="h-9 w-auto max-w-full object-contain"
              />
            </div>
          </div>
          <p className="relative mt-4 text-center font-[family-name:var(--font-instrument),Georgia,serif] text-[15px] italic leading-snug text-white/95">
            {B_CARD_PROFILE.tagline}
          </p>
        </header>

        {/* Profile */}
        <section className="-mt-2 flex flex-1 flex-col px-5 pb-28 pt-2">
          <div className="flex flex-col items-center text-center">
            <div className="relative -mt-10 mb-3">
              <div className="absolute inset-0 rounded-full bg-orange-500/30 blur-md" />
              <img
                src={B_CARD_PROFILE.photoSrc}
                alt={B_CARD_PROFILE.name}
                className="relative h-28 w-28 rounded-full object-cover object-top ring-4 ring-white shadow-xl"
              />
            </div>
            <h1 className="text-2xl font-bold tracking-tight text-slate-900">
              {B_CARD_PROFILE.name}
            </h1>
            <p className="mt-1 text-sm font-semibold text-[#ff4d12]">
              {B_CARD_PROFILE.title}
            </p>
            <p className="mt-0.5 text-xs font-medium text-slate-500">
              {B_CARD_PROFILE.company}
            </p>
          </div>

          <div className="mt-5 space-y-2.5 rounded-2xl border border-orange-100 bg-orange-50/50 p-3.5 text-sm">
            <a
              href={`tel:${B_CARD_PROFILE.phoneE164}`}
              className="flex items-center gap-2.5 font-medium text-slate-800"
            >
              <Phone className="h-4 w-4 text-[#ff4d12]" />
              {B_CARD_PROFILE.phoneDisplay}
            </a>
            <a
              href={`mailto:${B_CARD_PROFILE.email}`}
              className="flex items-center gap-2.5 font-medium text-slate-800 break-all"
            >
              <Mail className="h-4 w-4 shrink-0 text-[#ff4d12]" />
              {B_CARD_PROFILE.email}
            </a>
            <div className="flex items-center gap-2.5 font-medium text-slate-800">
              <MapPin className="h-4 w-4 text-[#ff4d12]" />
              {B_CARD_PROFILE.location}
            </div>
            <a
              href={B_CARD_PROFILE.website}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2.5 font-medium text-[#ff4d12]"
            >
              {B_CARD_PROFILE.websiteDisplay}
            </a>
          </div>

          {/* Socials */}
          <div className="mt-5">
            <p className="mb-2 text-center text-[11px] font-bold uppercase tracking-[0.14em] text-slate-400">
              Connect
            </p>
            <div className="grid grid-cols-4 gap-2">
              {B_CARD_PROFILE.socials.map((social) => {
                const Icon = socialIcon(social.id);
                return (
                  <a
                    key={social.id}
                    href={social.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex flex-col items-center gap-1.5 rounded-xl border border-slate-100 bg-white px-2 py-3 shadow-sm transition hover:border-orange-200 hover:shadow-md"
                  >
                    <span className="flex h-9 w-9 items-center justify-center rounded-full bg-[#ff4d12] text-white">
                      <Icon className="h-4 w-4" />
                    </span>
                    <span className="text-[10px] font-semibold text-slate-600">
                      {social.label}
                    </span>
                  </a>
                );
              })}
            </div>
          </div>

          {/* QR — card link */}
          <div className="mt-6 flex flex-col items-center rounded-2xl border border-slate-100 bg-slate-50 px-4 py-4">
            <p className="mb-2 text-[11px] font-bold uppercase tracking-[0.14em] text-slate-400">
              Scan digital card
            </p>
            {qrDataUrl ? (
              <img
                src={qrDataUrl}
                alt="QR code linking to this digital business card"
                className="h-36 w-36 rounded-xl bg-white p-2 shadow-sm"
              />
            ) : (
              <div className="flex h-36 w-36 items-center justify-center rounded-xl bg-white">
                <Loader2 className="h-6 w-6 animate-spin text-orange-500" />
              </div>
            )}
            <p className="mt-2 max-w-[240px] text-center text-[11px] text-slate-500">
              QR opens this card — not WhatsApp. Use the buttons below for WhatsApp or save
              contact.
            </p>
          </div>
        </section>

        {/* Sticky actions */}
        <div className="fixed inset-x-0 bottom-0 z-30 mx-auto w-full max-w-md border-t border-orange-100 bg-white/95 px-4 py-3 backdrop-blur">
          <div className="grid grid-cols-3 gap-2">
            <Button
              type="button"
              variant="outline"
              className="h-11 border-orange-200 text-slate-800"
              onClick={() => void shareCard()}
            >
              <Share2 className="mr-1.5 h-4 w-4 text-[#ff4d12]" />
              Share
            </Button>
            <Button
              type="button"
              className="h-11 bg-[#25D366] hover:bg-[#20bd5a]"
              onClick={openWhatsApp}
            >
              <MessageCircle className="mr-1.5 h-4 w-4" />
              WhatsApp
            </Button>
            <Button
              type="button"
              className="h-11 bg-[#ff4d12] hover:bg-[#e03d00]"
              onClick={() => setSheet("actions")}
            >
              <UserPlus className="mr-1.5 h-4 w-4" />
              Connect
            </Button>
          </div>
        </div>
      </div>

      {/* Action sheet */}
      {sheet ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/45 p-0 sm:items-center sm:p-4">
          <button
            type="button"
            className="absolute inset-0 cursor-default"
            aria-label="Close"
            onClick={() => setSheet(null)}
          />
          <div className="relative z-10 w-full max-w-md rounded-t-3xl bg-white p-5 shadow-2xl sm:rounded-3xl">
            <div className="mb-4 flex items-start justify-between gap-3">
              <div>
                <h2 className="text-lg font-bold text-slate-900">
                  {sheet === "actions" ? "How would you like to connect?" : "Share your contact"}
                </h2>
                <p className="mt-1 text-sm text-slate-500">
                  {sheet === "actions"
                    ? "Save our card, chat on WhatsApp, or leave your details for our CRM."
                    : "We’ll save this in the Prep Services CRM address book."}
                </p>
              </div>
              <button
                type="button"
                className="rounded-full p-1.5 text-slate-400 hover:bg-slate-100"
                onClick={() => setSheet(null)}
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {sheet === "actions" ? (
              <div className="space-y-2.5">
                <Button
                  type="button"
                  className="h-12 w-full justify-start bg-[#ff4d12] hover:bg-[#e03d00]"
                  onClick={() => {
                    downloadVCard();
                    setSheet(null);
                  }}
                >
                  <Download className="mr-2 h-4 w-4" />
                  1) Save our contact
                </Button>
                <Button
                  type="button"
                  className="h-12 w-full justify-start bg-[#25D366] hover:bg-[#20bd5a]"
                  onClick={() => {
                    openWhatsApp();
                    setSheet(null);
                  }}
                >
                  <MessageCircle className="mr-2 h-4 w-4" />
                  2) Open WhatsApp
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  className="h-12 w-full justify-start border-orange-200"
                  onClick={() => void pickContactFromPhone()}
                >
                  <UserPlus className="mr-2 h-4 w-4 text-[#ff4d12]" />
                  3) Share your contact
                </Button>
              </div>
            ) : (
              <div className="space-y-3">
                <div className="space-y-1.5">
                  <Label htmlFor="lead-name">Name *</Label>
                  <Input
                    id="lead-name"
                    value={lead.name}
                    onChange={(e) => setLead((p) => ({ ...p, name: e.target.value }))}
                    placeholder="Your name"
                    disabled={savingLead}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="lead-phone">Phone</Label>
                  <Input
                    id="lead-phone"
                    value={lead.phone}
                    onChange={(e) => setLead((p) => ({ ...p, phone: e.target.value }))}
                    placeholder="+1 …"
                    disabled={savingLead}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="lead-email">Email</Label>
                  <Input
                    id="lead-email"
                    type="email"
                    value={lead.email}
                    onChange={(e) => setLead((p) => ({ ...p, email: e.target.value }))}
                    placeholder="you@company.com"
                    disabled={savingLead}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="lead-company">Company</Label>
                  <Input
                    id="lead-company"
                    value={lead.company}
                    onChange={(e) => setLead((p) => ({ ...p, company: e.target.value }))}
                    placeholder="Optional"
                    disabled={savingLead}
                  />
                </div>
                <div className="flex gap-2 pt-1">
                  <Button
                    type="button"
                    variant="outline"
                    className="flex-1"
                    disabled={savingLead}
                    onClick={() => setSheet("actions")}
                  >
                    Back
                  </Button>
                  <Button
                    type="button"
                    className="flex-1 bg-[#ff4d12] hover:bg-[#e03d00]"
                    disabled={savingLead}
                    onClick={() => void submitLead()}
                  >
                    {savingLead ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                    Save to CRM
                  </Button>
                </div>
              </div>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
