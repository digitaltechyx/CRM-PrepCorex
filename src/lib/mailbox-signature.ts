/**
 * Company email signature — mirrors Hostinger Mail signature for info@.
 * Hostinger injects this server-side; CRM must append it on compose/send.
 */

export const MAILBOX_SIGNATURE_MARKER = "<!--psf-mailbox-signature-->";

export const MAILBOX_SIGNATURE_PLAIN = `
--
Best regards,

Arshad Iqbal
Operations Director | Prep Services FBA
The Partner Behind Your Fulfillment
info@prepservicesfba.com
+1 347 661 3010 (WhatsApp)
www.prepservicesfba.com
7000 Atrium Way C03, Mount Laurel, NJ 08054
LinkedIn: https://www.linkedin.com/in/arshadibl
`.trim();

export const MAILBOX_SIGNATURE_HTML = `
${MAILBOX_SIGNATURE_MARKER}
<div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.45;color:#222;">
  <p style="margin:0 0 12px;">--</p>
  <p style="margin:0 0 4px;">Best regards,</p>
  <p style="margin:12px 0 2px;"><strong>Arshad Iqbal</strong></p>
  <p style="margin:0 0 2px;">Operations Director | Prep Services FBA</p>
  <p style="margin:0 0 12px;color:#555;">The Partner Behind Your Fulfillment</p>
  <p style="margin:0 0 4px;">
    <a href="mailto:info@prepservicesfba.com" style="color:#5b4dff;text-decoration:none;">info@prepservicesfba.com</a>
  </p>
  <p style="margin:0 0 4px;">
    <a href="https://wa.me/13476613010" style="color:#5b4dff;text-decoration:none;">+1 347 661 3010</a>
  </p>
  <p style="margin:0 0 4px;">
    <a href="https://www.prepservicesfba.com" style="color:#5b4dff;text-decoration:none;">www.prepservicesfba.com</a>
  </p>
  <p style="margin:0 0 8px;">7000 Atrium Way C03, Mount Laurel, NJ 08054</p>
  <p style="margin:0;">
    <a href="https://www.linkedin.com/in/arshadibl" style="color:#5b4dff;text-decoration:none;">https://www.linkedin.com/in/arshadibl</a>
  </p>
</div>
`.trim();

export function messageHasSignature(text: string): boolean {
  const t = String(text || "");
  return (
    t.includes("Operations Director | Prep Services FBA") ||
    t.includes(MAILBOX_SIGNATURE_MARKER) ||
    (t.includes("Best regards,") && t.includes("Arshad Iqbal"))
  );
}

/** Ensure plain body ends with the company signature (once). */
export function ensurePlainSignature(body: string): string {
  const trimmed = String(body || "").replace(/\s+$/, "");
  if (messageHasSignature(trimmed)) return trimmed;
  if (!trimmed) return MAILBOX_SIGNATURE_PLAIN;
  return `${trimmed}\n\n${MAILBOX_SIGNATURE_PLAIN}`;
}

/** Strip signature block for editing quoted replies (keep user text only). */
export function stripPlainSignature(body: string): string {
  const text = String(body || "");
  const idx = text.indexOf("\n--\nBest regards,");
  if (idx >= 0) return text.slice(0, idx).replace(/\s+$/, "");
  const idx2 = text.indexOf("\nBest regards,\n\nArshad Iqbal");
  if (idx2 >= 0) return text.slice(0, idx2).replace(/\s+$/, "");
  return text;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function applyLightMarkup(escaped: string): string {
  return escaped
    .replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g, '<a href="$2">$1</a>')
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/__([^_]+)__/g, "<u>$1</u>")
    .replace(/(^|[\s(])_([^_\n]+)_([\s).,]|$)/g, "$1<em>$2</em>$3");
}

/** Build multipart-friendly HTML from plain compose text + signature. */
export function buildMailboxHtml(plainBody: string, opts?: { includeSignature?: boolean }): string {
  const includeSignature = opts?.includeSignature !== false;
  const raw = String(plainBody || "");
  const withoutSig = includeSignature ? stripPlainSignature(raw) : raw;
  const paragraphs = applyLightMarkup(escapeHtml(withoutSig))
    .split(/\n/)
    .map((line) => (line ? line : "&nbsp;"))
    .join("<br/>");

  const bodyHtml = `<div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.5;color:#222;">${paragraphs}</div>`;
  if (!includeSignature) return bodyHtml;
  return `${bodyHtml}<br/>${MAILBOX_SIGNATURE_HTML}`;
}
