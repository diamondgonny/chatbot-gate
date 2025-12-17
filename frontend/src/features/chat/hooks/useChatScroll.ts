"use client";

import { useRef, useEffect, useCallback } from "react";

export interface UseChatScrollReturn {
  messagesEndRef: React.RefObject<HTMLDivElement | null>;
  scrollToBottom: () => void;
}

/**
 * Chat message의 scroll 동작 관리
 * 새 message 도착 시 자동 scrolling 처리
 */
export function useChatScroll(
  dependencies: { messagesLength: number; isTyping: boolean }
): UseChatScrollReturn {
  const messagesEndRef = useRef<HTMLDivElement | null>(null);

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, []);

  // 새 message 또는 typing state 변경 시 자동 scroll
  useEffect(() => {
    scrollToBottom();
  }, [dependencies.messagesLength, dependencies.isTyping, scrollToBottom]);

  return {
    messagesEndRef,
    scrollToBottom,
  };
}
