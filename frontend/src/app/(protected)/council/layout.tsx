"use client";

import { useCallback, useState, useRef } from "react";
import { useRouter, useParams } from "next/navigation";
import {
  CouncilSidebar,
  CouncilSessionsProvider,
  CouncilMessagesProvider,
  CouncilStreamProvider,
  CouncilStatusProvider,
  useCouncilSessionsContext,
} from "@/features/council";
import type { CouncilSession } from "@/features/council/types";
import { AlertModal, ToastContainer } from "@/shared";
import { useToast } from "@/shared/hooks";

/**
 * Session context를 사용하는 내부 layout component
 * Provider 내에서 useContext를 사용할 수 있도록 분리
 */
function CouncilLayoutInner({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const params = useParams();
  const currentSessionId = (params.sessionId as string) || null;

  const { sessions, isLoading, isCreating, createSession, removeSessionOptimistic, restoreSession, deleteSessionApi } =
    useCouncilSessionsContext();
  const [sessionToDelete, setSessionToDelete] = useState<string | null>(null);
  const { toasts, showToast, removeToast } = useToast();

  // 복원 가능성을 위해 삭제 중인 session 저장
  const deletedSessionRef = useRef<CouncilSession | null>(null);

  const handleNewSession = useCallback(async () => {
    const newSessionId = await createSession();
    if (newSessionId) {
      router.push(`/council/${newSessionId}`);
    } else {
      showToast("Failed to create session. Please try again.", "error");
    }
  }, [createSession, router, showToast]);

  const handleSelectSession = useCallback(
    (sessionId: string) => {
      if (sessionId !== currentSessionId) {
        router.push(`/council/${sessionId}`);
      }
    },
    [currentSessionId, router]
  );

  const handleDeleteSession = useCallback((sessionId: string) => {
    setSessionToDelete(sessionId);
  }, []);

  const confirmDeleteSession = useCallback(async () => {
    if (!sessionToDelete) return;

    const deletedId = sessionToDelete;

    // 1. Modal 즉시 닫기
    setSessionToDelete(null);

    // 2. UI에서 optimistic하게 제거하고 복원을 위해 저장
    const removedSession = removeSessionOptimistic(deletedId);
    deletedSessionRef.current = removedSession;

    // 3. 현재 session 삭제 시 이동
    if (deletedId === currentSessionId) {
      const remainingSessions = sessions.filter(
        (s) => s.sessionId !== deletedId
      );
      if (remainingSessions.length > 0) {
        router.push(`/council/${remainingSessions[0].sessionId}`);
      } else {
        router.push("/council");
      }
    }

    // 4. 백그라운드에서 API 호출
    try {
      await deleteSessionApi(deletedId);
    } catch (error) {
      console.error("Error deleting council session:", error);
      // 실패 시 session 복원
      if (deletedSessionRef.current) {
        restoreSession(deletedSessionRef.current);
      }
      showToast("Failed to delete. Please try again.", "error");
    } finally {
      deletedSessionRef.current = null;
    }
  }, [
    sessionToDelete,
    removeSessionOptimistic,
    restoreSession,
    deleteSessionApi,
    currentSessionId,
    sessions,
    router,
    showToast,
  ]);

  return (
    <>
      <div className="h-full flex overflow-hidden">
        <CouncilSidebar
          sessions={sessions}
          currentSessionId={currentSessionId}
          isLoading={isLoading}
          isCreating={isCreating}
          onSelectSession={handleSelectSession}
          onNewSession={handleNewSession}
          onDeleteSession={handleDeleteSession}
        />
        <div className="flex-1 flex flex-col bg-slate-900 min-h-0 overflow-hidden">
          {children}
        </div>
      </div>

      <AlertModal
        isOpen={!!sessionToDelete}
        title="Delete chat"
        message="Are you sure you want to delete this chat? This action cannot be undone."
        confirmText="Delete"
        cancelText="Cancel"
        isDestructive
        onClose={() => setSessionToDelete(null)}
        onConfirm={confirmDeleteSession}
      />

      {/* Toast 알림 */}
      <ToastContainer toasts={toasts} onRemove={removeToast} />
    </>
  );
}

/**
 * Council Layout
 * Council page 전체에 걸쳐 지속적인 sidebar와 session 관리 제공
 * Session 간 이동 시에도 sidebar와 session 목록이 유지됨
 */
export default function CouncilLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <CouncilSessionsProvider>
      <CouncilMessagesProvider>
        <CouncilStreamProvider>
          <CouncilStatusProvider>
            <CouncilLayoutInner>{children}</CouncilLayoutInner>
          </CouncilStatusProvider>
        </CouncilStreamProvider>
      </CouncilMessagesProvider>
    </CouncilSessionsProvider>
  );
}
