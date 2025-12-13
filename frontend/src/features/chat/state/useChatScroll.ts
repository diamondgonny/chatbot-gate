"use client";

import { useRef, useEffect, useCallback } from "react";

export interface UseChatScrollReturn {
  messagesEndRef: React.RefObject<HTMLDivElement | null>;
  scrollToBottom: () => void;
}

/**
 * Manages scroll behavior for chat messages.
 * Handles auto-scrolling when new messages arrive.
 */
export function useChatScroll(
  dependencies: { messagesLength: number; isTyping: boolean }
): UseChatScrollReturn {
  const messagesEndRef = useRef<HTMLDivElement | null>(null);

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, []);

  // Auto-scroll on new messages or typing state change
  useEffect(() => {
    scrollToBottom();
  }, [dependencies.messagesLength, dependencies.isTyping, scrollToBottom]);

  return {
    messagesEndRef,
    scrollToBottom,
  };
}
