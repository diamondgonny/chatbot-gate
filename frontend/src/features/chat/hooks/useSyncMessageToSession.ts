"use client";

import { useEffect, useRef } from "react";
import type { Session, Message } from "../types";

export interface SyncConfig {
  messages: Message[];
  targetSessionId: string | null;
  setSessions: React.Dispatch<React.SetStateAction<Session[]>>;
  sortSessions: (sessions: Session[]) => Session[];
}

/**
 * Session list에 최신 message 동기화
 * 새 message 추가 시 lastMessage, title, updatedAt 업데이트
 *
 * 중요: Message가 추가될 때만 동기화 (session 전환 시 array 교체는 제외)
 * Session 전환 시 이전 session의 message가 새 session의 title을 덮어쓰는
 * race condition 방지
 */
export function useSyncMessageToSession(config: SyncConfig): void {
  const { messages, targetSessionId, setSessions, sortSessions } = config;

  // 이전 message를 추적하여 message 추가 vs array 교체 감지
  const prevMessagesRef = useRef<Message[]>([]);
  const prevSessionIdRef = useRef<string | null>(null);

  useEffect(() => {
    const prevMessages = prevMessagesRef.current;
    const prevSessionId = prevSessionIdRef.current;

    // 다음 비교를 위해 ref 업데이트
    prevMessagesRef.current = messages;
    prevSessionIdRef.current = targetSessionId;

    // Message가 없거나 target session이 없으면 건너뛰기
    if (messages.length === 0) return;
    if (!targetSessionId) return;

    // Session이 변경되면 건너뛰기 (array가 추가가 아닌 교체됨)
    if (prevSessionId !== targetSessionId) return;

    // 추가 작업이 아니면 건너뛰기
    // 추가란: 새 array가 더 길고 동일한 prefix를 공유
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
