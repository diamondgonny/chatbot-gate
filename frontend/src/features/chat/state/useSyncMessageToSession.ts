"use client";

import { useEffect } from "react";
import type { Session, Message } from "../domain";

export interface SyncConfig {
  messages: Message[];
  targetSessionId: string | null;
  setSessions: React.Dispatch<React.SetStateAction<Session[]>>;
  sortSessions: (sessions: Session[]) => Session[];
}

/**
 * Syncs the latest message to the session list.
 * Updates lastMessage, title, and updatedAt when messages change.
 */
export function useSyncMessageToSession(config: SyncConfig): void {
  const { messages, targetSessionId, setSessions, sortSessions } = config;

  useEffect(() => {
    if (messages.length === 0) return;
    if (!targetSessionId) return;

    const latestMessage = messages[messages.length - 1];

    setSessions((prev) => {
      const updated = prev.map((session) =>
        session.sessionId === targetSessionId
          ? {
              ...session,
              lastMessage: {
                content: latestMessage.content,
                role: latestMessage.role,
                timestamp: latestMessage.timestamp,
              },
              title: latestMessage.content,
              updatedAt: latestMessage.timestamp,
            }
          : session
      );
      return sortSessions(updated);
    });
  }, [messages, targetSessionId, setSessions, sortSessions]);
}
