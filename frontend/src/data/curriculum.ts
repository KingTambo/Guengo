/** Voice session surfaced in UI (conversation-only tutor app). */
export type SessionSelection = {
  id: string;
  /** Section or session title (short). */
  label: string;
  level: number;
  /** Unit/theme name for legacy level-based URLs (unused in UI). */
  unitLabel?: string;
  levelLabel?: string;
  /** Catalog copy when shown on briefing cards. */
  description: string;
};

/** Free-form tutor session: opening asks for today’s goal by voice. */
export const CONVERSATION: SessionSelection = {
  id: "conversation",
  label: "Conversation libre",
  level: 0,
  description:
    "Une intro joue depuis le fichier en cache après une seule génération TTS précisez votre objectif à voix haute Guengo enseigne teste corrige vous pouvez dire English only pour immersion",
};

/** Resolve a topic id — only conversation is selectable in the app; levels remain for bookmarks/API tests. */
export function findSession(sessionId: string): SessionSelection | undefined {
  return sessionId === CONVERSATION.id ? CONVERSATION : undefined;
}
