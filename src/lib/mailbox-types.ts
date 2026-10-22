export type MailboxFolderKey =
  | "inbox"
  | "drafts"
  | "scheduled"
  | "sent"
  | "spam"
  | "trash";

export type CrmMailboxAttachmentMeta = {
  index: number;
  filename: string;
  contentType: string;
  size: number;
};

export type CrmMailboxMessage = {
  id: string;
  mailboxId: string;
  mailboxEmail: string;
  folder: MailboxFolderKey;
  imapFolder: string;
  uid: number;
  messageId?: string;
  inReplyTo?: string;
  subject: string;
  from: string;
  fromName?: string;
  to: string;
  cc?: string;
  date: string;
  dateMs: number;
  snippet: string;
  textBody?: string;
  htmlBody?: string;
  seen: boolean;
  flagged: boolean;
  hasAttachments: boolean;
  attachments?: CrmMailboxAttachmentMeta[];
  syncedAt?: string;
};

export type MailboxSyncFolderResult = {
  folder: MailboxFolderKey;
  imapFolder: string;
  synced: number;
  lastUid: number;
  error?: string;
};

export const MAILBOX_COLLECTION = "crmMailboxMessages";
export const MAILBOX_SYNC_STATE_DOC = "mailbox_sync_state";
export const CRM_SETTINGS_COLLECTION = "crm_settings";

export const MAILBOX_FOLDERS: Array<{
  key: MailboxFolderKey;
  label: string;
}> = [
  { key: "inbox", label: "Inbox" },
  { key: "drafts", label: "Drafts" },
  { key: "scheduled", label: "Scheduled" },
  { key: "sent", label: "Sent" },
  { key: "spam", label: "Spam" },
  { key: "trash", label: "Trash" },
];

/** IMAP-backed folders (Scheduled is CRM-local). */
export const MAILBOX_IMAP_FOLDER_KEYS = [
  "inbox",
  "sent",
  "drafts",
  "spam",
  "trash",
] as const;

export const MAILBOX_FOLDER_KEYS: MailboxFolderKey[] = [
  "inbox",
  "drafts",
  "scheduled",
  "sent",
  "spam",
  "trash",
];
