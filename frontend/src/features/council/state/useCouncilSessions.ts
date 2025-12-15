"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import {
  getCouncilSessions,
  createCouncilSession,
  deleteCouncilSession,
} from "../services";
import type { CouncilSession } from "../domain";

function isAbortError(error: unknown): boolean {
  if (error instanceof Error) {
    if (error.name === "AbortError" || error.name === "CanceledError") {
      return true;
    }
  }

  if (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: string }).code === "ERR_CANCELED"
  ) {
    return true;
  }

  return false;
}

interface UseCouncilSessionsReturn {
  sessions: CouncilSession[];
  isLoading: boolean;
  error: string | null;
  loadSessions: () => Promise<void>;
  createSession: () => Promise<string | null>;
  removeSession: (sessionId: string) => Promise<boolean>;
  updateSessionTitle: (sessionId: string, title: string) => void;
  updateSessionTimestamp: (sessionId: string) => void;
}

export function useCouncilSessions(): UseCouncilSessionsReturn {
  const [sessions, setSessions] = useState<CouncilSession[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Track if component is still mounted to prevent state updates after unmount
  const isMountedRef = useRef(true);
  const loadAbortControllerRef = useRef<AbortController | null>(null);

  const loadSessions = useCallback(async () => {
    loadAbortControllerRef.current?.abort();
    const controller = new AbortController();
    loadAbortControllerRef.current = controller;

    setIsLoading(true);
    setError(null);
    try {
      const { sessions: fetchedSessions } = await getCouncilSessions(controller.signal);
      if (!isMountedRef.current) return;
      setSessions(fetchedSessions);
    } catch (err) {
      if (!isMountedRef.current) return;
      if (isAbortError(err)) return;
      console.error("Error loading council sessions:", err);
      setError("Failed to load sessions");
    } finally {
      if (isMountedRef.current) {
        setIsLoading(false);
      }
      if (loadAbortControllerRef.current === controller) {
        loadAbortControllerRef.current = null;
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

  const updateSessionTitle = useCallback(
    (sessionId: string, title: string): void => {
      setSessions((prev) => {
        const updated = prev.map((s) =>
          s.sessionId === sessionId
            ? { ...s, title, updatedAt: new Date().toISOString() }
            : s
        );
        // Sort by updatedAt descending (most recent first)
        return updated.sort(
          (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
        );
      });
    },
    []
  );

  const updateSessionTimestamp = useCallback(
    (sessionId: string): void => {
      setSessions((prev) => {
        const updated = prev.map((s) =>
          s.sessionId === sessionId
            ? { ...s, updatedAt: new Date().toISOString() }
            : s
        );
        // Sort by updatedAt descending (most recent first)
        return updated.sort(
          (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
        );
      });
    },
    []
  );

  // Load sessions on mount and cleanup on unmount
  useEffect(() => {
    isMountedRef.current = true;
    loadSessions();
    return () => {
      isMountedRef.current = false;
      loadAbortControllerRef.current?.abort();
      loadAbortControllerRef.current = null;
    };
  }, [loadSessions]);

  return {
    sessions,
    isLoading,
    error,
    loadSessions,
    createSession,
    removeSession,
    updateSessionTitle,
    updateSessionTimestamp,
  };
}
