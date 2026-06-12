import nodemailer from "nodemailer";
import type SMTPTransport from "nodemailer/lib/smtp-transport";

export type SmtpConfig = {
  host: string;
  port: number;
  secure: boolean;
  user: string;
  password: string;
  from: string;
  fromName: string;
};

export function readSmtpConfigFromEnv(): SmtpConfig | null {
  const host = process.env.SMTP_HOST?.trim();
  const user = process.env.SMTP_USER?.trim();
  const password = process.env.SMTP_PASSWORD?.trim();
  if (!host || !user || !password) return null;

  const port = Number(process.env.SMTP_PORT || 587);
  const secure = process.env.SMTP_SECURE === "true" || port === 465;

  return {
    host,
    port,
    secure,
    user,
    password,
    from: (process.env.SMTP_FROM || user).trim(),
    fromName: (process.env.SMTP_FROM_NAME || "Prep Services FBA").trim(),
  };
}

/** Hostinger Professional Email is powered by Titan — auth often fails on smtp.hostinger.com. */
function hostFallbacks(primaryHost: string): string[] {
  const normalized = primaryHost.toLowerCase();
  const hosts = [primaryHost];
  if (normalized === "smtp.hostinger.com") {
    hosts.push("smtp.titan.email");
  }
  return [...new Set(hosts)];
}

function createTransporter(config: SmtpConfig, host: string) {
  return nodemailer.createTransport({
    host,
    port: config.port,
    secure: config.secure,
    requireTLS: !config.secure,
    auth: {
      user: config.user,
      pass: config.password,
    },
    tls: {
      rejectUnauthorized: false,
      minVersion: "TLSv1.2",
    },
    connectionTimeout: 15_000,
    greetingTimeout: 15_000,
    socketTimeout: 20_000,
  } as SMTPTransport.Options);
}

function isAuthFailure(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /535|authentication failed|invalid login|auth/i.test(message);
}

export async function sendSmtpMail(options: {
  config: SmtpConfig;
  to: string;
  subject: string;
  message: string;
  attachments: { filename: string; content: Buffer }[];
}) {
  const { config, to, subject, message, attachments } = options;
  const from = config.fromName
    ? `${config.fromName} <${config.from}>`
    : config.from;

  let lastError: unknown;
  for (const host of hostFallbacks(config.host)) {
    const transporter = createTransporter(config, host);
    try {
      await transporter.sendMail({
        from,
        to,
        subject,
        text: message,
        attachments,
      });
      return { host };
    } catch (error) {
      lastError = error;
      const hasMoreHosts = host !== hostFallbacks(config.host).at(-1);
      if (hasMoreHosts && isAuthFailure(error)) {
        console.warn(`[SMTP] Auth failed on ${host}, trying fallback host…`);
        continue;
      }
      throw error;
    } finally {
      transporter.close();
    }
  }

  throw lastError ?? new Error("Failed to send email.");
}
