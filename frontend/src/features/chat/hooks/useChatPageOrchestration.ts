"use client";

import { useEffect, useCallback, useMemo } from "react";
import { useSessions } from "./useSessions";
import { useChat } from "./useChat";
import { useChatScroll } from "./useChatScroll";
import { useAutoError } from "./useAutoError";
import { useDeleteSession } from "./useDeleteSession";
import { useSyncMessageToSession } from "./useSyncMessageToSession";
import type { Message } from "../types";
import type { SessionServices } from "./useSessions";
import type { ChatServices } from "./useChat";

/**
 * Dependency injection을 위한 service interface
 * 실제 API 호출 없이 orchestration hook 테스트 가능
 */
export interface OrchestrationServices {
  sessionServices?: SessionServices;
  chatServices?: ChatServices;
}

export interface OrchestrationCallbacks {
  /** Session 삭제 실패 시 호출 - error toast 표시에 사용 */
  onDeleteError?: (message: string) => void;
  /** Session 생성 실패 시 호출 - error toast 표시에 사용 */
  onCreateError?: (message: string) => void;
}

export interface UseChatPageOrchestrationReturn {
  // Loading states
  isLoading: boolean;
  loadingSessionId: string | null;
  isCreating: boolean;

  // Session state
  sessions: ReturnType<typeof useSessions>["sessions"];
  currentSessionId: string | null;
  sessionError: string | null;

  // Chat state
  messages: Message[];
  input: string;
  setInput: (value: string) => void;
  isTyping: boolean;
  messagesEndRef: React.RefObject<HTMLDivElement | null>;

  // Delete modal state
  sessionToDelete: string | null;

  // Handlers
  handleSendMessage: (e: React.FormEvent) => Promise<void>;
  handleNewChat: () => Promise<void>;
  handleSessionSelect: (sessionId: string) => Promise<void>;
  requestDeleteSession: (sessionId: string) => void;
  confirmDeleteSession: () => Promise<void>;
  cancelDeleteSession: () => void;
}

/**
 * 집중된 hook들을 조합하여 chat page state 조율
 * 각 hook은 단일 책임을 가짐
 */
export function useChatPageOrchestration(
  services: OrchestrationServices = {},
  callbacks: OrchestrationCallbacks = {}
): UseChatPageOrchestrationReturn {
  // Session 관리
  const {
    sessions,
    setSessions,
    currentSessionId,
    setCurrentSessionId,
    loadingSessionId,
    setLoadingSessionId,
    isCreating,
    sessionError,
    setSessionError,
    loadSessions,
    handleCreateSession,
    handleDeleteSession: deleteSessionApi,
    removeSessionOptimistic,
    sortSessionsByUpdatedAt,
  } = useSessions(services.sessionServices);

  // Chat state
  const {
    messages,
    setMessages,
    input,
    setInput,
    isTyping,
    isLoading,
    setIsLoading,
    intendedSessionRef,
    loadChatHistory,
    sendMessage,
  } = useChat(services.chatServices);

  // UI: Scroll 관리 (useChat에서 추출)
  const { messagesEndRef } = useChatScroll({
    messagesLength: messages.length,
    isTyping,
  });

  // Side effect: Error 자동 제거
  const clearSessionError = useCallback(() => setSessionError(null), [setSessionError]);
  useAutoError(sessionError, clearSessionError);

  // Side effect: Session list에 message 동기화
  useSyncMessageToSession({
    messages,
    targetSessionId: intendedSessionRef.current,
    setSessions,
    sortSessions: sortSessionsByUpdatedAt,
  });

  // Mount 시 chat history 로드
  useEffect(() => {
    const loadOnMount = async () => {
      try {
        const sortedSessions = await loadSessions();

        if (sortedSessions.length > 0) {
          const latestSession = sortedSessions[0];
          intendedSessionRef.current = latestSession.sessionId;
          setCurrentSessionId(latestSession.sessionId);

          const loadedMessages = await loadChatHistory(latestSession.sessionId);
          setMessages(loadedMessages);
        } else {
          setCurrentSessionId(null);
          setMessages([]);
        }
      } catch (error) {
        console.error("Error loading chat history:", error);
        setMessages([]);
      } finally {
        setIsLoading(false);
      }
    };

    loadOnMount();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSendMessage = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim()) return;

    let sessionId = currentSessionId;

    // Session이 없으면 지연 생성
    if (!sessionId) {
      const newSession = await handleCreateSession();
      if (!newSession) return;

      sessionId = newSession.sessionId;
      intendedSessionRef.current = sessionId;
      setCurrentSessionId(sessionId);
      setSessions((prev) => [newSession, ...prev]);
    }

    const userMessage: Message = {
      id: Date.now().toString(),
      role: "user",
      content: input,
      timestamp: new Date().toISOString(),
    };

    setMessages((prev) => [...prev, userMessage]);
    setInput("");

    const aiMessage = await sendMessage(input, sessionId);
    if (aiMessage) {
      setMessages((prev) => [...prev, aiMessage]);
    }
  }, [
    input,
    currentSessionId,
    handleCreateSession,
    setCurrentSessionId,
    setSessions,
    setMessages,
    setInput,
    sendMessage,
    intendedSessionRef,
  ]);

  const handleNewChat = useCallback(async () => {
    const newSession = await handleCreateSession();
    if (!newSession) return;

    intendedSessionRef.current = newSession.sessionId;
    setCurrentSessionId(newSession.sessionId);
    setMessages([]);
    await loadSessions();
  }, [handleCreateSession, setCurrentSessionId, setMessages, loadSessions, intendedSessionRef]);

  const handleSessionSelect = useCallback(async (sessionId: string) => {
    if (sessionId === currentSessionId) return;

    try {
      setLoadingSessionId(sessionId);
      intendedSessionRef.current = sessionId;
      setCurrentSessionId(sessionId);

      const loadedMessages = await loadChatHistory(sessionId);
      setMessages(loadedMessages);
    } catch (error) {
      console.error("Error loading session:", error);
    } finally {
      setLoadingSessionId(null);
    }
  }, [currentSessionId, setLoadingSessionId, setCurrentSessionId, loadChatHistory, setMessages, intendedSessionRef]);

  // Optimistic UI 패턴으로 session 삭제
  const deleteConfig = useMemo(() => ({
    onDelete: deleteSessionApi,
    onBeforeDelete: async (deletedSessionId: string) => {
      // 1. UI에서 즉시 제거 (optimistic)
      removeSessionOptimistic(deletedSessionId);

      // 2. 현재 session 삭제 시 이동
      if (currentSessionId === deletedSessionId) {
        const remainingSessions = sessions.filter(
          (s) => s.sessionId !== deletedSessionId
        );
        if (remainingSessions.length > 0) {
          await handleSessionSelect(remainingSessions[0].sessionId);
        } else {
          await handleNewChat();
        }
      }
    },
    onError: () => {
      callbacks.onDeleteError?.("Failed to delete. Please refresh and try again.");
    },
  }), [deleteSessionApi, removeSessionOptimistic, currentSessionId, sessions, handleSessionSelect, handleNewChat, callbacks]);

  const {
    sessionToDelete,
    requestDelete: requestDeleteSession,
    cancelDelete: cancelDeleteSession,
    confirmDelete: confirmDeleteSession,
  } = useDeleteSession(deleteConfig);

  return {
    // Loading states
    isLoading,
    loadingSessionId,
    isCreating,

    // Session state
    sessions,
    currentSessionId,
    sessionError,

    // Chat state
    messages,
    input,
    setInput,
    isTyping,
    messagesEndRef,

    // Delete modal state
    sessionToDelete,

    // Handlers
    handleSendMessage,
    handleNewChat,
    handleSessionSelect,
    requestDeleteSession,
    confirmDeleteSession,
    cancelDeleteSession,
  };
}
