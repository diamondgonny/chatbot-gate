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
  isCreating: boolean;
  error: string | null;
  loadSessions: () => Promise<void>;
  createSession: () => Promise<string | null>;
  removeSession: (sessionId: string) => Promise<boolean>;
  /** UI에서 낙관적으로 session 제거 (복원 가능하도록 제거된 session 반환) */
  removeSessionOptimistic: (sessionId: string) => CouncilSession | null;
  /** UI에 session 복원 (예: 삭제 실패 후) */
  restoreSession: (session: CouncilSession) => void;
  /** API 호출만 수행 (UI 업데이트 없음) */
  deleteSessionApi: (sessionId: string) => Promise<void>;
  updateSessionTitle: (sessionId: string, title: string) => void;
  updateSessionTimestamp: (sessionId: string) => void;
}

export function useCouncilSessions(): UseCouncilSessionsReturn {
  const [sessions, setSessions] = useState<CouncilSession[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Unmount 후 state 업데이트 방지를 위해 component mount 상태 추적
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
    setIsCreating(true);
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
    } finally {
      if (isMountedRef.current) {
        setIsCreating(false);
      }
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

  const removeSessionOptimistic = useCallback(
    (sessionId: string): CouncilSession | null => {
      let removedSession: CouncilSession | null = null;
      setSessions((prev) => {
        const session = prev.find((s) => s.sessionId === sessionId);
        if (session) {
          removedSession = session;
        }
        return prev.filter((s) => s.sessionId !== sessionId);
      });
      return removedSession;
    },
    []
  );

  const restoreSession = useCallback(
    (session: CouncilSession): void => {
      setSessions((prev) => {
        // 다시 추가하고 updatedAt 기준 내림차순 정렬
        const updated = [...prev, session];
        return updated.sort(
          (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
        );
      });
    },
    []
  );

  const deleteSessionApi = useCallback(
    async (sessionId: string): Promise<void> => {
      await deleteCouncilSession(sessionId);
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
        // updatedAt 기준 내림차순 정렬 (최신 우선)
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
        // updatedAt 기준 내림차순 정렬 (최신 우선)
        return updated.sort(
          (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
        );
      });
    },
    []
  );

  // Mount 시 session 로드 및 unmount 시 cleanup
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
    isCreating,
    error,
    loadSessions,
    createSession,
    removeSession,
    removeSessionOptimistic,
    restoreSession,
    deleteSessionApi,
    updateSessionTitle,
    updateSessionTimestamp,
  };
}
