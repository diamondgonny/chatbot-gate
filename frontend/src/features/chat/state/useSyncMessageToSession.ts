"use client";

import { useEffect, useRef } from "react";
import type { Session, Message } from "../domain";

export interface SyncConfig {
  messages: Message[];
  targetSessionId: string | null;
  setSessions: React.Dispatch<React.SetStateAction<Session[]>>;
  sortSessions: (sessions: Session[]) => Session[];
}

/**
 * Syncs the latest message to the session list.
 * Updates lastMessage, title, and updatedAt when a NEW message is added.
 *
 * Important: Only syncs when messages are appended (not when the array is replaced
 * during session switching). This prevents race conditions where switching sessions
 * could cause the previous session's messages to overwrite the new session's title.
 */
export function useSyncMessageToSession(config: SyncConfig): void {
  const { messages, targetSessionId, setSessions, sortSessions } = config;

  // Track previous messages to detect if a message was added vs array replaced
  const prevMessagesRef = useRef<Message[]>([]);
  const prevSessionIdRef = useRef<string | null>(null);

  useEffect(() => {
    const prevMessages = prevMessagesRef.current;
    const prevSessionId = prevSessionIdRef.current;

    // Update refs for next comparison
    prevMessagesRef.current = messages;
    prevSessionIdRef.current = targetSessionId;

    // Skip if no messages or no target session
    if (messages.length === 0) return;
    if (!targetSessionId) return;

    // Skip if session changed (array was replaced, not appended)
    if (prevSessionId !== targetSessionId) return;

    // Skip if this is not an append operation
    // An append means: new array is longer AND shares the same prefix
    const isAppend =
      messages.length > prevMessages.length &&
      prevMessages.every((msg, i) => messages[i]?.id === msg.id);

    if (!isAppend) return;

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
