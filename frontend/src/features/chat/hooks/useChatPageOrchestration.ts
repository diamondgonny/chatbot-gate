"use client";

import { useState, useEffect, useCallback } from "react";
import { useSessions } from "./useSessions";
import { useChat } from "./useChat";
import type { Session, Message } from "../types";
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

  // Session state
  sessions: Session[];
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

export function useChatPageOrchestration(
  services: OrchestrationServices = {}
): UseChatPageOrchestrationReturn {
  const {
    sessions,
    setSessions,
    currentSessionId,
    setCurrentSessionId,
    loadingSessionId,
    setLoadingSessionId,
    sessionError,
    setSessionError,
    loadSessions,
    handleCreateSession,
    handleDeleteSession,
    sortSessionsByUpdatedAt,
  } = useSessions(services.sessionServices);

  const {
    messages,
    setMessages,
    input,
    setInput,
    isTyping,
    isLoading,
    setIsLoading,
    messagesEndRef,
    intendedSessionRef,
    loadChatHistory,
    sendMessage,
  } = useChat(services.chatServices);

  // Local state for delete modal
  const [sessionToDelete, setSessionToDelete] = useState<string | null>(null);

  // Keep sidebar titles in sync with latest message content
  useEffect(() => {
    if (messages.length === 0) return;

    const targetSessionId = intendedSessionRef.current;
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
      return sortSessionsByUpdatedAt(updated);
    });
  }, [messages, setSessions, sortSessionsByUpdatedAt, intendedSessionRef]);

  // Auto-dismiss session error after 10 seconds
  useEffect(() => {
    if (sessionError) {
      const timer = setTimeout(() => {
        setSessionError(null);
      }, 10000);
      return () => clearTimeout(timer);
    }
  }, [sessionError, setSessionError]);

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
  }, [loadSessions, setCurrentSessionId, setMessages, setIsLoading, loadChatHistory, intendedSessionRef]);

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
  }, [
    currentSessionId,
    setLoadingSessionId,
    setCurrentSessionId,
    loadChatHistory,
    setMessages,
    intendedSessionRef,
  ]);

  const requestDeleteSession = useCallback((sessionId: string) => {
    setSessionToDelete(sessionId);
  }, []);

  const confirmDeleteSession = useCallback(async () => {
    if (!sessionToDelete) return;

    try {
      await handleDeleteSession(sessionToDelete);
      const updatedSessions = await loadSessions();

      if (currentSessionId === sessionToDelete) {
        const remainingSessions = updatedSessions.filter(
          (s) => s.sessionId !== sessionToDelete
        );
        if (remainingSessions.length > 0) {
          await handleSessionSelect(remainingSessions[0].sessionId);
        } else {
          await handleNewChat();
        }
      }
    } catch (error) {
      console.error("Error deleting session:", error);
    } finally {
      setSessionToDelete(null);
    }
  }, [
    sessionToDelete,
    handleDeleteSession,
    loadSessions,
    currentSessionId,
    handleSessionSelect,
    handleNewChat,
  ]);

  const cancelDeleteSession = useCallback(() => {
    setSessionToDelete(null);
  }, []);

  return {
    // Loading states
    isLoading,
    loadingSessionId,

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
