"use client";

import { useState, useCallback } from "react";
import {
  getSessions as defaultGetSessions,
  createSession as defaultCreateSession,
  deleteSession as defaultDeleteSession,
} from "../services";
import type { Session, SessionsResponse, CreateSessionResponse } from "../domain";

/**
 * Service interface for dependency injection.
 * Allows testing hooks without MSW by providing mock implementations.
 */
export interface SessionServices {
  getSessions: () => Promise<SessionsResponse>;
  createSession: () => Promise<CreateSessionResponse>;
  deleteSession: (sessionId: string) => Promise<void>;
}

const defaultServices: SessionServices = {
  getSessions: defaultGetSessions,
  createSession: defaultCreateSession,
  deleteSession: defaultDeleteSession,
};

export interface UseSessionsReturn {
  sessions: Session[];
  setSessions: React.Dispatch<React.SetStateAction<Session[]>>;
  currentSessionId: string | null;
  setCurrentSessionId: React.Dispatch<React.SetStateAction<string | null>>;
  loadingSessionId: string | null;
  setLoadingSessionId: React.Dispatch<React.SetStateAction<string | null>>;
  isCreating: boolean;
  sessionError: string | null;
  setSessionError: React.Dispatch<React.SetStateAction<string | null>>;
  loadSessions: () => Promise<Session[]>;
  handleCreateSession: () => Promise<Session | null>;
  handleDeleteSession: (sessionId: string) => Promise<void>;
  sortSessionsByUpdatedAt: (sessionList: Session[]) => Session[];
}

export function useSessions(services: SessionServices = defaultServices): UseSessionsReturn {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
  const [loadingSessionId, setLoadingSessionId] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [sessionError, setSessionError] = useState<string | null>(null);

  // Maintain sessions in descending updatedAt order (most recent first)
  const sortSessionsByUpdatedAt = useCallback((sessionList: Session[]) => {
    return [...sessionList].sort((a, b) => {
      const timeA = new Date(a.updatedAt).getTime();
      const timeB = new Date(b.updatedAt).getTime();
      if (timeA === timeB) {
        return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      }
      return timeB - timeA;
    });
  }, []);

  const loadSessions = useCallback(async (): Promise<Session[]> => {
    try {
      const { sessions: fetchedSessions } = await services.getSessions();
      // Sort sessions to ensure consistent order
      const sortedSessions = sortSessionsByUpdatedAt(fetchedSessions);
      setSessions(sortedSessions);
      return sortedSessions;
    } catch (error) {
      console.error("Error loading sessions:", error);
      return [];
    }
  }, [sortSessionsByUpdatedAt, services]);

  const handleCreateSession = useCallback(async (): Promise<Session | null> => {
    setIsCreating(true);
    try {
      const newSession = await services.createSession();
      const session: Session = {
        sessionId: newSession.sessionId,
        title: newSession.title || "New Chat",
        lastMessage: null,
        updatedAt: newSession.updatedAt,
        createdAt: newSession.createdAt || newSession.updatedAt,
      };
      return session;
    } catch (error: unknown) {
      console.error("Error creating session:", error);

      // Handle rate limit
      if (error && typeof error === "object" && "response" in error) {
        const axiosErr = error as { response?: { status?: number; data?: { error?: string; limit?: number; count?: number } } };
        if (axiosErr.response?.status === 429) {
          const data = axiosErr.response.data;
          const limit = data?.limit;
          const count = data?.count;
          const msg = data?.error || "Too many sessions. Please delete an existing session.";
          setSessionError(limit ? `${msg} (${count || limit}/${limit})` : msg);
        }
      } else {
        setSessionError("Failed to create a new session. Please try again.");
      }
      return null;
    } finally {
      setIsCreating(false);
    }
  }, [services]);

  const handleDeleteSession = useCallback(async (sessionId: string): Promise<void> => {
    try {
      await services.deleteSession(sessionId);
    } catch (error) {
      console.error("Error deleting session:", error);
      throw error;
    }
  }, [services]);

  return {
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
    handleDeleteSession,
    sortSessionsByUpdatedAt,
  };
}
