export type ImapMailboxConfig = {
  id: string;
  label: string;
  user: string;
  password: string;
  host: string;
  port: number;
  secure: boolean;
};

function imapHostFallbacks(primaryHost: string): string[] {
  const normalized = primaryHost.toLowerCase();
  const hosts = [primaryHost];
  if (normalized === "imap.hostinger.com") {
    hosts.push("imap.titan.email");
  }
  if (normalized === "imap.titan.email") {
    hosts.push("imap.hostinger.com");
  }
  return [...new Set(hosts)];
}

/** Shared IMAP host/port for both inboxes (Hostinger / Titan). */
export function readImapConnectionFromEnv(): {
  host: string;
  port: number;
  secure: boolean;
  hostsToTry: string[];
} | null {
  const smtpHost = process.env.SMTP_HOST?.trim() || "";
  const defaultImapHost =
    smtpHost.toLowerCase() === "smtp.hostinger.com"
      ? "imap.hostinger.com"
      : smtpHost.toLowerCase() === "smtp.titan.email"
        ? "imap.titan.email"
        : "imap.hostinger.com";

  const host = (process.env.IMAP_HOST?.trim() || defaultImapHost).trim();
  if (!host) return null;

  const port = Number(process.env.IMAP_PORT || 993);
  const secure = process.env.IMAP_SECURE !== "false" && port === 993;

  return {
    host,
    port,
    secure,
    hostsToTry: imapHostFallbacks(host),
  };
}

/**
 * Mailboxes used for inbound contact sync only.
 * Outbound SMTP remains SMTP_USER / info@ — never send from Arshad.
 */
export function readImapMailboxesFromEnv(): ImapMailboxConfig[] {
  const conn = readImapConnectionFromEnv();
  if (!conn) return [];

  const smtpPassword = process.env.SMTP_PASSWORD?.trim() || "";
  const smtpUser = process.env.SMTP_USER?.trim() || "info@prepservicesfba.com";

  const infoUser =
    process.env.IMAP_USER_INFO?.trim() ||
    process.env.IMAP_USER?.trim() ||
    smtpUser ||
    "info@prepservicesfba.com";
  const infoPassword =
    process.env.IMAP_PASSWORD_INFO?.trim() ||
    process.env.IMAP_PASSWORD?.trim() ||
    smtpPassword;

  const arshadUser =
    process.env.IMAP_USER_ARSHAD?.trim() || "arshad@prepservicesfba.com";
  const arshadPassword = process.env.IMAP_PASSWORD_ARSHAD?.trim() || "";

  const mailboxes: ImapMailboxConfig[] = [];

  if (infoUser && infoPassword) {
    mailboxes.push({
      id: "info",
      label: infoUser,
      user: infoUser,
      password: infoPassword,
      host: conn.host,
      port: conn.port,
      secure: conn.secure,
    });
  }

  if (arshadUser && arshadPassword) {
    mailboxes.push({
      id: "arshad",
      label: arshadUser,
      user: arshadUser,
      password: arshadPassword,
      host: conn.host,
      port: conn.port,
      secure: conn.secure,
    });
  }

  return mailboxes;
}

export function ourMailboxEmails(): Set<string> {
  const emails = new Set<string>();
  for (const mb of readImapMailboxesFromEnv()) {
    emails.add(mb.user.toLowerCase());
  }
  const smtpUser = process.env.SMTP_USER?.trim();
  const smtpFrom = process.env.SMTP_FROM?.trim();
  if (smtpUser) emails.add(smtpUser.toLowerCase());
  if (smtpFrom) emails.add(smtpFrom.toLowerCase());
  emails.add("info@prepservicesfba.com");
  emails.add("arshad@prepservicesfba.com");
  return emails;
}

export { imapHostFallbacks };
