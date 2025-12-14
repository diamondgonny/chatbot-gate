"use client";

import { useCallback, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import {
  CouncilSidebar,
  CouncilSessionsProvider,
  useCouncilSessionsContext,
} from "@/features/council";
import { AlertModal } from "@/shared";

/**
 * Inner layout component that uses the sessions context
 * Separated to allow useContext within the provider
 */
function CouncilLayoutInner({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const params = useParams();
  const currentSessionId = (params.sessionId as string) || null;

  const { sessions, isLoading, createSession, removeSession, loadSessions } =
    useCouncilSessionsContext();
  const [sessionToDelete, setSessionToDelete] = useState<string | null>(null);

  const handleNewSession = useCallback(async () => {
    const newSessionId = await createSession();
    if (newSessionId) {
      router.push(`/council/${newSessionId}`);
    }
  }, [createSession, router]);

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

    const success = await removeSession(sessionToDelete);
    if (success) {
      // If deleting current session, navigate to another session or index
      if (sessionToDelete === currentSessionId) {
        await loadSessions();
        const remainingSessions = sessions.filter(
          (s) => s.sessionId !== sessionToDelete
        );
        if (remainingSessions.length > 0) {
          router.push(`/council/${remainingSessions[0].sessionId}`);
        } else {
          router.push("/council");
        }
      }
    }
    setSessionToDelete(null);
  }, [
    sessionToDelete,
    removeSession,
    currentSessionId,
    loadSessions,
    sessions,
    router,
  ]);

  return (
    <>
      <div className="h-screen flex overflow-hidden">
        <CouncilSidebar
          sessions={sessions}
          currentSessionId={currentSessionId}
          isLoading={isLoading}
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
      <CouncilLayoutInner>{children}</CouncilLayoutInner>
    </CouncilSessionsProvider>
  );
}
