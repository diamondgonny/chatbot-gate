"use client";

import { useState, useCallback } from "react";

export interface UseDeleteSessionReturn {
  sessionToDelete: string | null;
  requestDelete: (sessionId: string) => void;
  cancelDelete: () => void;
  confirmDelete: () => Promise<void>;
}

export interface DeleteSessionConfig {
  onDelete: (sessionId: string) => Promise<void>;
  /** Called immediately before API call - use for optimistic UI updates and navigation */
  onBeforeDelete?: (deletedSessionId: string) => void | Promise<void>;
  /** Called if deletion fails - use for error toasts */
  onError?: (sessionId: string, error: unknown) => void;
}

/**
 * Manages delete confirmation modal state and deletion logic.
 * Implements optimistic delete pattern:
 * 1. Close modal immediately
 * 2. Execute onBeforeDelete (optimistic UI update + navigation)
 * 3. Call API in background
 * 4. Call onError if API fails
 */
export function useDeleteSession(config: DeleteSessionConfig): UseDeleteSessionReturn {
  const [sessionToDelete, setSessionToDelete] = useState<string | null>(null);

  const requestDelete = useCallback((sessionId: string) => {
    setSessionToDelete(sessionId);
  }, []);

  const cancelDelete = useCallback(() => {
    setSessionToDelete(null);
  }, []);

  const confirmDelete = useCallback(async () => {
    if (!sessionToDelete) return;

    const deletedId = sessionToDelete;

    // 1. Close modal immediately for responsive UX
    setSessionToDelete(null);

    // 2. Execute optimistic updates and navigation
    if (config.onBeforeDelete) {
      await config.onBeforeDelete(deletedId);
    }

    // 3. Call API in background
    try {
      await config.onDelete(deletedId);
    } catch (error) {
      // 4. Notify on error
      console.error("Error deleting session:", error);
      if (config.onError) {
        config.onError(deletedId, error);
      }
    }
  }, [sessionToDelete, config]);

  return {
    sessionToDelete,
    requestDelete,
    cancelDelete,
    confirmDelete,
  };
}
