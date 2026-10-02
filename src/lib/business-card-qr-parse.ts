import type { AddressBookSeed } from "@/lib/crm-address-book";
import { normalizeWhatsAppId } from "@/lib/crm-address-book";

export type ParsedBusinessCardQr = {
  seed: AddressBookSeed;
  /** Detected payload kind for UI feedback. */
  kind:
    | "vcard"
    | "whatsapp"
    | "tel"
    | "mailto"
    | "url"
    | "mecard"
    | "text"
    | "empty";
  /** Full raw QR string (always preserved in notes). */
  raw: string;
  website?: string;
};

function clean(value: string, max = 300): string {
  return value.replace(/\r/g, "").trim().slice(0, max);
}

function unescapeVCard(value: string): string {
  return value
    .replace(/\\n/gi, "\n")
    .replace(/\\,/g, ",")
    .replace(/\\;/g, ";")
    .replace(/\\\\/g, "\\");
}

function unfoldVCard(raw: string): string {
  // RFC 6350 line folding: CRLF + space/tab continues previous line.
  return raw.replace(/\r\n[ \t]/g, "").replace(/\n[ \t]/g, "");
}

function pickVCardField(lines: string[], names: string[]): string {
  for (const name of names) {
    const upper = name.toUpperCase();
    for (const line of lines) {
      const idx = line.indexOf(":");
      if (idx < 0) continue;
      const left = line.slice(0, idx).toUpperCase();
      const key = left.split(";")[0];
      if (key === upper || key.endsWith(`.${upper}`)) {
        return unescapeVCard(line.slice(idx + 1).trim());
      }
    }
  }
  return "";
}

function parseVCardName(fn: string, n: string): string {
  if (fn) return fn;
  if (!n) return "";
  // N: Last;First;Middle;Prefix;Suffix
  const parts = n.split(";").map((p) => p.trim()).filter(Boolean);
  if (parts.length >= 2) return `${parts[1]} ${parts[0]}`.trim();
  return parts.join(" ").trim();
}

function parseTelValue(value: string): string {
  const cleaned = value.replace(/^TEL[:\s]*/i, "").trim();
  return cleaned.replace(/[^\d+]/g, "") || cleaned;
}

function parseMeCard(raw: string): ParsedBusinessCardQr | null {
  const text = clean(raw);
  if (!/^MECARD:/i.test(text)) return null;
  const body = text.replace(/^MECARD:/i, "");
  const fields: Record<string, string> = {};
  for (const part of body.split(";")) {
    const idx = part.indexOf(":");
    if (idx < 0) continue;
    const key = part.slice(0, idx).trim().toUpperCase();
    const val = part.slice(idx + 1).trim();
    if (key && val) fields[key] = val;
  }
  const fullName = clean(fields.N || "");
  const phone = parseTelValue(fields.TEL || "");
  const email = clean(fields.EMAIL || "").toLowerCase();
  const company = clean(fields.ORG || "");
  const website = clean(fields.URL || "");
  const note = clean(fields.NOTE || "");
  const address = clean(fields.ADR || "").replace(/;/g, ", ");

  const notes = buildNotes({
    kind: "MECARD",
    website,
    extraNote: note,
    raw: text,
  });

  return {
    kind: "mecard",
    raw: text,
    website: website || undefined,
    seed: {
      fullName: fullName || email || phone || "QR contact",
      phone: phone || undefined,
      email: email || undefined,
      company: company || undefined,
      address: address || undefined,
      notes,
      source: "b_card",
      whatsappId: phone ? normalizeWhatsAppId(phone) || undefined : undefined,
    },
  };
}

function parseVCard(raw: string): ParsedBusinessCardQr | null {
  const unfolded = unfoldVCard(raw);
  if (!/BEGIN:VCARD/i.test(unfolded)) return null;
  const lines = unfolded
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  const fullName = parseVCardName(
    pickVCardField(lines, ["FN"]),
    pickVCardField(lines, ["N"])
  );
  const company = pickVCardField(lines, ["ORG"]);
  const title = pickVCardField(lines, ["TITLE"]);
  const email = pickVCardField(lines, ["EMAIL"]).toLowerCase();
  const phone = parseTelValue(pickVCardField(lines, ["TEL"]));
  const website = pickVCardField(lines, ["URL"]);
  const note = pickVCardField(lines, ["NOTE"]);
  const adrRaw = pickVCardField(lines, ["ADR"]);
  // ADR: PO Box;Extended;Street;City;Region;Postal;Country
  const adrParts = adrRaw.split(";").map((p) => unescapeVCard(p).trim());
  const address = [adrParts[2], adrParts[1], adrParts[0]].filter(Boolean).join(", ");
  const city = adrParts[3] || "";
  const state = adrParts[4] || "";
  const zip = adrParts[5] || "";
  const country = adrParts[6] || "";

  const notes = buildNotes({
    kind: "vCard",
    website,
    title,
    extraNote: note,
    raw: clean(raw, 2000),
  });

  return {
    kind: "vcard",
    raw: clean(raw, 2000),
    website: website || undefined,
    seed: {
      fullName: fullName || email || phone || "QR contact",
      company: company || undefined,
      email: email || undefined,
      phone: phone || undefined,
      address: address || undefined,
      city: city || undefined,
      state: state || undefined,
      zip: zip || undefined,
      country: country || undefined,
      notes,
      source: "b_card",
      whatsappId: phone ? normalizeWhatsAppId(phone) || undefined : undefined,
    },
  };
}

function buildNotes(input: {
  kind: string;
  website?: string;
  title?: string;
  extraNote?: string;
  raw: string;
}): string {
  const chunks: string[] = [`Scanned business card QR (${input.kind})`];
  if (input.title) chunks.push(`Title: ${input.title}`);
  if (input.website) chunks.push(`Website: ${input.website}`);
  if (input.extraNote) chunks.push(input.extraNote);
  chunks.push(`Raw QR: ${input.raw}`);
  return chunks.join("\n").slice(0, 2000);
}

function parseWhatsAppUrl(raw: string): ParsedBusinessCardQr | null {
  const text = clean(raw);
  let phone = "";
  try {
    const url = new URL(text);
    const host = url.hostname.replace(/^www\./, "").toLowerCase();
    if (host === "wa.me" || host === "api.whatsapp.com" || host === "chat.whatsapp.com") {
      if (host === "wa.me") {
        phone = url.pathname.replace(/^\//, "").split(/[/?#]/)[0] || "";
      } else if (host === "api.whatsapp.com") {
        phone = url.searchParams.get("phone") || "";
      }
    }
  } catch {
    const m = text.match(/(?:wa\.me\/|phone=)(\+?\d{7,15})/i);
    if (m) phone = m[1];
  }
  const digits = normalizeWhatsAppId(phone);
  if (!digits) return null;
  const displayPhone = phone.startsWith("+") ? phone : `+${digits}`;
  return {
    kind: "whatsapp",
    raw: text,
    seed: {
      fullName: `WhatsApp ${displayPhone}`,
      phone: displayPhone,
      whatsappId: digits,
      notes: buildNotes({ kind: "WhatsApp", website: text, raw: text }),
      source: "b_card",
    },
  };
}

function parseMailto(raw: string): ParsedBusinessCardQr | null {
  const text = clean(raw);
  if (!/^mailto:/i.test(text)) return null;
  const without = text.replace(/^mailto:/i, "");
  const email = clean(without.split("?")[0]).toLowerCase();
  if (!email.includes("@")) return null;
  return {
    kind: "mailto",
    raw: text,
    seed: {
      fullName: email.split("@")[0] || email,
      email,
      notes: buildNotes({ kind: "mailto", raw: text }),
      source: "b_card",
    },
  };
}

function parseTel(raw: string): ParsedBusinessCardQr | null {
  const text = clean(raw);
  if (!/^tel:/i.test(text)) return null;
  const phone = parseTelValue(text.replace(/^tel:/i, ""));
  if (!phone) return null;
  return {
    kind: "tel",
    raw: text,
    seed: {
      fullName: phone,
      phone,
      whatsappId: normalizeWhatsAppId(phone) || undefined,
      notes: buildNotes({ kind: "tel", raw: text }),
      source: "b_card",
    },
  };
}

function parseHttpUrl(raw: string): ParsedBusinessCardQr | null {
  const text = clean(raw);
  try {
    const url = new URL(text);
    if (!/^https?:$/i.test(url.protocol)) return null;
    // Our own digital card URL — still save the link under B-Card.
    const host = url.hostname.toLowerCase();
    const isOurBCard =
      url.pathname.includes("/b-card") ||
      host.includes("prepservicesfba") ||
      host.includes("prepcorex");
    return {
      kind: "url",
      raw: text,
      website: text,
      seed: {
        fullName: isOurBCard ? "Prep Services FBA (B-Card)" : url.hostname.replace(/^www\./, ""),
        notes: buildNotes({
          kind: isOurBCard ? "B-Card URL" : "URL",
          website: text,
          raw: text,
        }),
        source: "b_card",
      },
    };
  } catch {
    return null;
  }
}

function parseLooseText(raw: string): ParsedBusinessCardQr {
  const text = clean(raw, 2000);
  const emailMatch = text.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
  const phoneMatch = text.match(/(\+?\d[\d\s().-]{6,}\d)/);
  const urlMatch = text.match(/https?:\/\/[^\s]+/i);
  const email = emailMatch ? emailMatch[0].toLowerCase() : "";
  const phone = phoneMatch ? parseTelValue(phoneMatch[1]) : "";
  const website = urlMatch ? clean(urlMatch[0]) : "";
  const firstLine = text.split(/\n/).map((l) => l.trim()).find(Boolean) || "";
  const fullName =
    firstLine && !firstLine.includes("@") && !/^https?:/i.test(firstLine) && !/^\+?\d/.test(firstLine)
      ? firstLine.slice(0, 120)
      : email || phone || "QR contact";

  return {
    kind: "text",
    raw: text,
    website: website || undefined,
    seed: {
      fullName,
      email: email || undefined,
      phone: phone || undefined,
      whatsappId: phone ? normalizeWhatsAppId(phone) || undefined : undefined,
      notes: buildNotes({ kind: "text", website, raw: text }),
      source: "b_card",
    },
  };
}

/**
 * Parse any business-card / contact QR payload into an address-book seed.
 * Always keeps the full raw payload in notes so nothing from the QR is lost.
 */
export function parseBusinessCardQr(rawInput: string): ParsedBusinessCardQr {
  const raw = clean(rawInput, 4000);
  if (!raw) {
    return {
      kind: "empty",
      raw: "",
      seed: { fullName: "", notes: "", source: "b_card" },
    };
  }

  return (
    parseVCard(raw) ||
    parseMeCard(raw) ||
    parseWhatsAppUrl(raw) ||
    parseMailto(raw) ||
    parseTel(raw) ||
    parseHttpUrl(raw) ||
    parseLooseText(raw)
  );
}

/**
 * Parse OCR text from a photographed / uploaded business card.
 * Keeps full OCR dump in notes; extracts email/phone/url/name/company when possible.
 */
export function parseBusinessCardOcrText(ocrText: string): ParsedBusinessCardQr {
  const raw = clean(ocrText, 4000);
  if (!raw) {
    return {
      kind: "empty",
      raw: "",
      seed: { fullName: "", notes: "", source: "b_card" },
    };
  }

  // Prefer structured payloads if OCR somehow captured a QR string.
  const structured =
    parseVCard(raw) ||
    parseMeCard(raw) ||
    parseWhatsAppUrl(raw) ||
    parseMailto(raw) ||
    parseTel(raw);
  if (structured) {
    return {
      ...structured,
      seed: {
        ...structured.seed,
        notes: buildNotes({
          kind: `OCR + ${structured.kind}`,
          website: structured.website,
          raw,
        }),
        source: "b_card",
      },
    };
  }

  const emailMatch = raw.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
  const phoneMatches = [...raw.matchAll(/(\+?\d[\d\s().-]{6,}\d)/g)].map((m) =>
    parseTelValue(m[1])
  );
  const phone = phoneMatches.find((p) => normalizeWhatsAppId(p).length >= 7) || "";
  const urlMatch = raw.match(/(?:https?:\/\/|www\.)[^\s]+/i);
  const website = urlMatch
    ? clean(urlMatch[0].startsWith("http") ? urlMatch[0] : `https://${urlMatch[0]}`)
    : "";

  const lines = raw
    .split(/\n/)
    .map((l) => l.trim())
    .filter((l) => l.length >= 2);

  const isJunkLine = (line: string) =>
    line.includes("@") ||
    /^https?:/i.test(line) ||
    /^www\./i.test(line) ||
    /^\+?\d[\d\s().-]{5,}$/.test(line) ||
    /phone|email|mobile|tel|fax|web|www/i.test(line);

  const nameLine = lines.find((l) => !isJunkLine(l) && l.length <= 60) || "";
  const companyLine =
    lines.find(
      (l) =>
        l !== nameLine &&
        !isJunkLine(l) &&
        l.length <= 80 &&
        /(llc|inc|ltd|corp|co\.|company|services|fba|prep|solutions|group)/i.test(l)
    ) ||
    lines.find((l) => l !== nameLine && !isJunkLine(l) && l.length <= 80) ||
    "";

  const email = emailMatch ? emailMatch[0].toLowerCase() : "";
  const fullName = nameLine || email.split("@")[0] || phone || "Business card contact";

  return {
    kind: "text",
    raw,
    website: website || undefined,
    seed: {
      fullName: fullName.slice(0, 120),
      company: companyLine ? companyLine.slice(0, 120) : undefined,
      email: email || undefined,
      phone: phone || undefined,
      whatsappId: phone ? normalizeWhatsAppId(phone) || undefined : undefined,
      notes: buildNotes({ kind: "OCR business card", website, raw }),
      source: "b_card",
    },
  };
}
