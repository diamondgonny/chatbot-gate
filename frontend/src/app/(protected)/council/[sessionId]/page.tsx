"use client";

import { useEffect, useCallback, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import { useCouncilSessions } from "@/hooks";
import { CouncilProvider, useCouncilContext } from "@/hooks/council";
import { CouncilSidebar, MessageList, InputArea } from "@/components/council";
import AlertModal from "@/components/common/AlertModal";

/**
 * Inner component that uses the council context
 */
function CouncilSessionContent() {
  const router = useRouter();
  const params = useParams();
  const sessionId = params.sessionId as string;

  const {
    sessions,
    isLoading: sessionsLoading,
    createSession,
    removeSession,
    loadSessions,
  } = useCouncilSessions();

  const { loadSession } = useCouncilContext();
  const [sessionToDelete, setSessionToDelete] = useState<string | null>(null);

  // Load session on mount or sessionId change
  useEffect(() => {
    if (sessionId) {
      loadSession(sessionId);
    }
  }, [sessionId, loadSession]);

  const handleNewSession = useCallback(async () => {
    const newSessionId = await createSession();
    if (newSessionId) {
      router.push(`/council/${newSessionId}`);
    }
  }, [createSession, router]);

  const handleSelectSession = useCallback(
    (selectedSessionId: string) => {
      if (selectedSessionId !== sessionId) {
        router.push(`/council/${selectedSessionId}`);
      }
    },
    [sessionId, router]
  );

  const handleDeleteSession = useCallback(
    (targetSessionId: string) => {
      setSessionToDelete(targetSessionId);
    },
    []
  );

  const handleMessageSent = useCallback(() => {
    loadSessions();
  }, [loadSessions]);

  const confirmDeleteSession = useCallback(async () => {
    if (!sessionToDelete) return;
    const success = await removeSession(sessionToDelete);
    if (success && sessionToDelete === sessionId) {
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
    setSessionToDelete(null);
  }, [loadSessions, removeSession, router, sessionId, sessionToDelete, sessions]);

  return (
    <>
      <div className="h-screen flex overflow-hidden">
        <CouncilSidebar
          sessions={sessions}
          currentSessionId={sessionId}
          isLoading={sessionsLoading}
          onSelectSession={handleSelectSession}
          onNewSession={handleNewSession}
          onDeleteSession={handleDeleteSession}
        />

        {/* Main chat area */}
        <div className="flex-1 flex flex-col bg-slate-900 min-h-0 overflow-hidden">
          {/* Messages area */}
          <div className="flex-1 overflow-y-auto p-4 scrollbar-custom min-h-0">
            <MessageList />
          </div>

          {/* Input area */}
          <InputArea sessionId={sessionId} onMessageSent={handleMessageSent} />
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
 * Page component wrapped with CouncilProvider
 */
export default function CouncilSessionPage() {
  return (
    <CouncilProvider>
      <CouncilSessionContent />
    </CouncilProvider>
  );
}
