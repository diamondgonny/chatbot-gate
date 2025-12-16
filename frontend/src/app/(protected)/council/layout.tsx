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
import type { CouncilSession } from "@/features/council/domain";
import { AlertModal, ToastContainer } from "@/shared";
import { useToast } from "@/shared/hooks";

/**
 * Inner layout component that uses the sessions context
 * Separated to allow useContext within the provider
 */
function CouncilLayoutInner({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const params = useParams();
  const currentSessionId = (params.sessionId as string) || null;

  const { sessions, isLoading, isCreating, createSession, removeSessionOptimistic, restoreSession, deleteSessionApi } =
    useCouncilSessionsContext();
  const [sessionToDelete, setSessionToDelete] = useState<string | null>(null);
  const { toasts, showToast, removeToast } = useToast();

  // Store the session being deleted for potential restore
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

    // 1. Close modal immediately
    setSessionToDelete(null);

    // 2. Optimistically remove from UI and save for potential restore
    const removedSession = removeSessionOptimistic(deletedId);
    deletedSessionRef.current = removedSession;

    // 3. Navigate if deleting current session
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

    // 4. Call API in background
    try {
      await deleteSessionApi(deletedId);
    } catch (error) {
      console.error("Error deleting council session:", error);
      // Restore session on failure
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

      {/* Toast Notifications */}
      <ToastContainer toasts={toasts} onRemove={removeToast} />
    </>
  );
}

/**
 * Council Layout
 * Provides persistent sidebar and session management across council pages
 * The sidebar and session list persist when navigating between sessions
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
