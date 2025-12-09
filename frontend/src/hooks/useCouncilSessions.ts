"use client";

import { useState, useCallback, useEffect } from "react";
import {
  getCouncilSessions,
  createCouncilSession,
  deleteCouncilSession,
} from "@/apis";
import type { CouncilSession } from "@/types";

interface UseCouncilSessionsReturn {
  sessions: CouncilSession[];
  isLoading: boolean;
  error: string | null;
  loadSessions: () => Promise<void>;
  createSession: () => Promise<string | null>;
  removeSession: (sessionId: string) => Promise<boolean>;
}

export function useCouncilSessions(): UseCouncilSessionsReturn {
  const [sessions, setSessions] = useState<CouncilSession[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadSessions = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const { sessions: fetchedSessions } = await getCouncilSessions();
      setSessions(fetchedSessions);
    } catch (err) {
      console.error("Error loading council sessions:", err);
      setError("Failed to load sessions");
    } finally {
      setIsLoading(false);
    }
  }, []);

  const createSession = useCallback(async (): Promise<string | null> => {
    try {
      const newSession = await createCouncilSession();
      setSessions((prev) => [
        {
          sessionId: newSession.sessionId,
          title: newSession.title,
          createdAt: newSession.createdAt,
          updatedAt: newSession.createdAt,
        },
        ...prev,
      ]);
      return newSession.sessionId;
    } catch (err) {
      console.error("Error creating council session:", err);
      setError("Failed to create session");
      return null;
    }
  }, []);

  const removeSession = useCallback(
    async (sessionId: string): Promise<boolean> => {
      try {
        await deleteCouncilSession(sessionId);
        setSessions((prev) => prev.filter((s) => s.sessionId !== sessionId));
        return true;
      } catch (err) {
        console.error("Error deleting council session:", err);
        setError("Failed to delete session");
        return false;
      }
    },
    []
  );

  // Load sessions on mount
  useEffect(() => {
    loadSessions();
  }, [loadSessions]);

  return {
    sessions,
    isLoading,
    error,
    loadSessions,
    createSession,
    removeSession,
  };
}
