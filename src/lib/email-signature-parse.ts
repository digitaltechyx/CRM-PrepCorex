/**
 * Extract phone / company from an email body snippet (signature).
 * Callers must discard the raw body after parsing — nothing is persisted here.
 */

const GENERIC_EMAIL_DOMAINS = new Set([
  "gmail.com",
  "googlemail.com",
  "yahoo.com",
  "yahoo.co.uk",
  "outlook.com",
  "hotmail.com",
  "live.com",
  "icloud.com",
  "me.com",
  "aol.com",
  "proton.me",
  "protonmail.com",
  "mail.com",
  "gmx.com",
  "gmx.net",
  "yandex.com",
  "qq.com",
  "163.com",
]);

export type SignatureFields = {
  phone?: string;
  company?: string;
};

/** Convert HTML (or mixed) mail content into plain-ish text for signature scanning. */
export function htmlOrTextToPlain(input: string): string {
  let text = String(input || "");
  text = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  text = text.replace(/<style[\s\S]*?<\/style>/gi, " ");
  text = text.replace(/<script[\s\S]*?<\/script>/gi, " ");
  text = text.replace(/<br\s*\/?>/gi, "\n");
  text = text.replace(/<\/(p|div|tr|li|h[1-6])>/gi, "\n");
  text = text.replace(/<[^>]+>/g, " ");
  text = text
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&#39;/gi, "'")
    .replace(/&quot;/gi, '"')
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCharCode(parseInt(h, 16)));
  text = text.replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n");
  return text.trim();
}

/** Prefer the trailing signature-ish block; drop quoted reply chains. */
export function extractSignatureBlock(plain: string): string {
  const lines = plain.split("\n").map((l) => l.replace(/\u00a0/g, " ").trimEnd());
  const cutPatterns = [
    /^on .+ wrote:\s*$/i,
    /^from:\s+/i,
    /^sent:\s+/i,
    /^-----original message-----$/i,
    /^_{5,}$/,
    /^-{5,}\s*forwarded message\s*-{5,}$/i,
  ];

  let end = lines.length;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (cutPatterns.some((re) => re.test(line))) {
      end = i;
      break;
    }
    if (/^>/.test(line) && i > 8) {
      end = i;
      break;
    }
  }

  const usable = lines.slice(0, end);
  // Signature is usually at the bottom — keep last ~30 non-empty-ish lines.
  const nonEmptyIdx = usable
    .map((l, idx) => ({ l: l.trim(), idx }))
    .filter((x) => x.l.length > 0)
    .map((x) => x.idx);
  if (nonEmptyIdx.length === 0) return "";
  const startIdx = nonEmptyIdx[Math.max(0, nonEmptyIdx.length - 30)] ?? 0;
  return usable.slice(startIdx).join("\n").trim();
}

function normalizePhoneCandidate(raw: string): string | undefined {
  let s = raw.replace(/[^\d+()\-\s.]/g, "").replace(/\s+/g, " ").trim();
  s = s.replace(/^\+{2,}/, "+");
  const digits = s.replace(/\D/g, "");
  if (digits.length < 7 || digits.length > 15) return undefined;
  // Reject obvious dates / order ids that look numeric but aren't phones.
  if (/^(19|20)\d{2}$/.test(digits)) return undefined;
  return s;
}

export function extractPhoneFromText(text: string): string | undefined {
  const labeled = [
    /(?:tel|telephone|phone|mobile|cell|whatsapp|whats\s*app|m|p|t)\s*[:.#\-–—]\s*([+\d(][\d\s().\-]{6,22}\d)/gi,
    /(?:call|reach)\s*(?:me|us)?\s*(?:at|:)\s*([+\d(][\d\s().\-]{6,22}\d)/gi,
  ];
  for (const re of labeled) {
    let match: RegExpExecArray | null;
    while ((match = re.exec(text)) !== null) {
      const phone = normalizePhoneCandidate(match[1]);
      if (phone) return phone;
    }
  }

  // Unlabeled international / US-style numbers in signature block.
  const loose = text.match(
    /(?:^|[\s|])(\+?\d{1,3}[\s.\-]?\(?\d{2,4}\)?[\s.\-]?\d{3,4}[\s.\-]?\d{3,4})(?:$|[\s|,;])/gm
  );
  if (loose) {
    for (const raw of loose) {
      const phone = normalizePhoneCandidate(raw);
      if (phone) return phone;
    }
  }
  return undefined;
}

function looksLikePersonName(line: string): boolean {
  if (line.length < 2 || line.length > 60) return false;
  if (/[@:/\\d]/.test(line)) return false;
  if (/\b(inc|llc|ltd|corp|company|limited|gmbh|plc|co\.)\b/i.test(line)) return false;
  const words = line.split(/\s+/);
  return words.length >= 1 && words.length <= 5 && words.every((w) => /^[A-Za-z][A-Za-z'.-]*$/.test(w));
}

function looksLikeCompanyLine(line: string): boolean {
  const t = line.trim();
  if (t.length < 2 || t.length > 80) return false;
  if (/^(tel|phone|mobile|email|www|http|fax|skype|linkedin)\b/i.test(t)) return false;
  if (/@/.test(t)) return false;
  if (/^https?:/i.test(t)) return false;
  if (/\b(inc\.?|llc|ltd\.?|corp\.?|corporation|company|limited|gmbh|plc|co\.|pvt\.?|private limited)\b/i.test(t)) {
    return true;
  }
  // Title-case multi-word without looking like a street address.
  if (/^\d+\s/.test(t)) return false;
  if (/\b(street|st\.|avenue|ave\.|road|rd\.|suite|floor|unit)\b/i.test(t)) return false;
  const words = t.split(/\s+/);
  if (words.length >= 2 && words.length <= 6 && /^[A-Z]/.test(t) && !looksLikePersonName(t)) {
    // Avoid job titles alone.
    if (/^(ceo|cto|cfo|founder|manager|director|sales|support|owner)$/i.test(t)) return false;
    return true;
  }
  return false;
}

export function extractCompanyFromText(text: string, senderEmail?: string): string | undefined {
  const labeled = text.match(
    /(?:company|organisation|organization|business|firm)\s*[:\-–—]\s*([^\n|,;]{2,80})/i
  );
  if (labeled?.[1]) {
    const company = labeled[1].trim().replace(/\s+/g, " ");
    if (company.length >= 2) return company;
  }

  const lines = text
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);

  // After a person-name line, the next substantive line is often company.
  for (let i = 0; i < lines.length - 1; i++) {
    if (looksLikePersonName(lines[i]) && looksLikeCompanyLine(lines[i + 1])) {
      return lines[i + 1];
    }
  }

  for (const line of lines) {
    if (looksLikeCompanyLine(line) && /\b(inc|llc|ltd|corp|company|limited|gmbh|plc|co\.)\b/i.test(line)) {
      return line;
    }
  }

  // Weak fallback: derive from email domain (skip free mail providers).
  if (senderEmail && senderEmail.includes("@")) {
    const domain = senderEmail.split("@")[1]?.toLowerCase() || "";
    if (domain && !GENERIC_EMAIL_DOMAINS.has(domain)) {
      const base = domain.split(".")[0] || "";
      if (base.length >= 3 && !/^(mail|email|smtp|imap|mx)$/i.test(base)) {
        return base.charAt(0).toUpperCase() + base.slice(1);
      }
    }
  }

  return undefined;
}

/** Parse phone + company from a temporary body snippet. Does not return/store the body. */
export function parseSignatureFields(rawBody: string, senderEmail?: string): SignatureFields {
  const plain = htmlOrTextToPlain(rawBody);
  if (!plain) return {};
  const block = extractSignatureBlock(plain) || plain.slice(-2500);
  const phone = extractPhoneFromText(block);
  const company = extractCompanyFromText(block, senderEmail);
  return {
    phone: phone || undefined,
    company: company || undefined,
  };
}
