export const LEXI_MESSAGES_COLLECTION = "lexiMessages";
export const LEXI_CHAT_COLLECTION = "lexiChatMessages";
export const LEXI_STATE_COLLECTION = "crm_settings";
export const LEXI_STATE_DOC = "lexi_state";

export type LexiMessageType =
  | "draft_ready"
  | "lead_suggestion"
  | "lead_action"
  | "contact"
  | "appreciation"
  | "reminder"
  | "general";

export type LexiMessage = {
  id: string;
  type: LexiMessageType;
  title: string;
  body: string;
  read: boolean;
  readAt?: string | null;
  createdAt: string;
  createdAtMs: number;
  /** Optional deep link in CRM */
  href?: string | null;
  meta?: Record<string, unknown>;
};

export type LexiChatRole = "user" | "assistant" | "system";

export type LexiChatMessage = {
  id: string;
  role: LexiChatRole;
  content: string;
  createdAt: string;
  createdAtMs: number;
  uid: string;
};
