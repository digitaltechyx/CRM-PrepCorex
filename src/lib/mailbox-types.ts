export type MailboxFolderKey = "inbox" | "sent" | "drafts" | "spam";

export type CrmMailboxMessage = {
  id: string;
  mailboxId: string;
  mailboxEmail: string;
  folder: MailboxFolderKey;
  imapFolder: string;
  uid: number;
  messageId?: string;
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
  { key: "sent", label: "Sent" },
  { key: "drafts", label: "Drafts" },
  { key: "spam", label: "Spam" },
];
