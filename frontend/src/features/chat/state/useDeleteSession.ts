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
  onAfterDelete?: (deletedSessionId: string) => Promise<void>;
}

/**
 * Manages delete confirmation modal state and deletion logic.
 * Separates the "what to delete" decision from the actual deletion.
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

    try {
      await config.onDelete(deletedId);

      if (config.onAfterDelete) {
        await config.onAfterDelete(deletedId);
      }
    } catch (error) {
      console.error("Error deleting session:", error);
    } finally {
      setSessionToDelete(null);
    }
  }, [sessionToDelete, config]);

  return {
    sessionToDelete,
    requestDelete,
    cancelDelete,
    confirmDelete,
  };
}
