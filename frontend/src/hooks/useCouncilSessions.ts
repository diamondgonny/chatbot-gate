"use client";

import { useState, useCallback, useEffect, useRef } from "react";
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

  // Track if component is still mounted to prevent state updates after unmount
  const isMountedRef = useRef(true);

  const loadSessions = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const { sessions: fetchedSessions } = await getCouncilSessions();
      if (!isMountedRef.current) return;
      setSessions(fetchedSessions);
    } catch (err) {
      if (!isMountedRef.current) return;
      console.error("Error loading council sessions:", err);
      setError("Failed to load sessions");
    } finally {
      if (isMountedRef.current) {
        setIsLoading(false);
      }
    }
  }, []);

  const createSession = useCallback(async (): Promise<string | null> => {
    try {
      const newSession = await createCouncilSession();
      if (!isMountedRef.current) return null;
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
      if (!isMountedRef.current) return null;
      console.error("Error creating council session:", err);
      setError("Failed to create session");
      return null;
    }
  }, []);

  const removeSession = useCallback(
    async (sessionId: string): Promise<boolean> => {
      try {
        await deleteCouncilSession(sessionId);
        if (!isMountedRef.current) return false;
        setSessions((prev) => prev.filter((s) => s.sessionId !== sessionId));
        return true;
      } catch (err) {
        if (!isMountedRef.current) return false;
        console.error("Error deleting council session:", err);
        setError("Failed to delete session");
        return false;
      }
    },
    []
  );

  // Load sessions on mount and cleanup on unmount
  useEffect(() => {
    isMountedRef.current = true;
    loadSessions();
    return () => {
      isMountedRef.current = false;
    };
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
