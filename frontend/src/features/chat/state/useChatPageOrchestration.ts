"use client";

import { useEffect, useCallback, useMemo } from "react";
import { useSessions } from "./useSessions";
import { useChat } from "./useChat";
import { useChatScroll } from "./useChatScroll";
import { useAutoError } from "./useAutoError";
import { useDeleteSession } from "./useDeleteSession";
import { useSyncMessageToSession } from "./useSyncMessageToSession";
import type { Message } from "../domain";
import type { SessionServices } from "./useSessions";
import type { ChatServices } from "./useChat";

/**
 * Service interfaces for dependency injection.
 * Allows testing the orchestration hook without real API calls.
 */
export interface OrchestrationServices {
  sessionServices?: SessionServices;
  chatServices?: ChatServices;
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
 * Orchestrates chat page state by composing focused hooks.
 * Each hook has a single responsibility.
 */
export function useChatPageOrchestration(
  services: OrchestrationServices = {}
): UseChatPageOrchestrationReturn {
  // Session management
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

  // UI: Scroll management (extracted from useChat)
  const { messagesEndRef } = useChatScroll({
    messagesLength: messages.length,
    isTyping,
  });

  // Side effect: Auto-dismiss errors
  const clearSessionError = useCallback(() => setSessionError(null), [setSessionError]);
  useAutoError(sessionError, clearSessionError);

  // Side effect: Sync messages to session list
  useSyncMessageToSession({
    messages,
    targetSessionId: intendedSessionRef.current,
    setSessions,
    sortSessions: sortSessionsByUpdatedAt,
  });

  // Load chat history on mount
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

    // Lazily create a session if none exists
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

  // Delete session with navigation handling
  const deleteConfig = useMemo(() => ({
    onDelete: deleteSessionApi,
    onAfterDelete: async (deletedSessionId: string) => {
      const updatedSessions = await loadSessions();

      if (currentSessionId === deletedSessionId) {
        const remainingSessions = updatedSessions.filter(
          (s) => s.sessionId !== deletedSessionId
        );
        if (remainingSessions.length > 0) {
          await handleSessionSelect(remainingSessions[0].sessionId);
        } else {
          await handleNewChat();
        }
      }
    },
  }), [deleteSessionApi, loadSessions, currentSessionId, handleSessionSelect, handleNewChat]);

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
