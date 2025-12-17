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
  /** API 호출 직전에 호출 - optimistic UI 업데이트와 navigation에 사용 */
  onBeforeDelete?: (deletedSessionId: string) => void | Promise<void>;
  /** 삭제 실패 시 호출 - error toast에 사용 */
  onError?: (sessionId: string, error: unknown) => void;
}

/**
 * 삭제 확인 modal state와 삭제 로직 관리
 * Optimistic delete 패턴 구현:
 * 1. Modal 즉시 닫기
 * 2. onBeforeDelete 실행 (optimistic UI 업데이트 + navigation)
 * 3. 백그라운드에서 API 호출
 * 4. API 실패 시 onError 호출
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

    // 1. 반응형 UX를 위해 modal 즉시 닫기
    setSessionToDelete(null);

    // 2. Optimistic 업데이트와 navigation 실행
    if (config.onBeforeDelete) {
      await config.onBeforeDelete(deletedId);
    }

    // 3. 백그라운드에서 API 호출
    try {
      await config.onDelete(deletedId);
    } catch (error) {
      // 4. Error 발생 시 알림
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
