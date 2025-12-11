"use client";

import { useEffect, useCallback } from "react";
import { useRouter, useParams } from "next/navigation";
import { useCouncilSessions } from "@/hooks";
import { CouncilProvider, useCouncilContext } from "@/hooks/council";
import { CouncilSidebar, MessageList, InputArea } from "@/components/council";

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
    async (targetSessionId: string) => {
      if (confirm("Are you sure you want to delete this session?")) {
        const success = await removeSession(targetSessionId);
        if (success && targetSessionId === sessionId) {
          await loadSessions();
          const remainingSessions = sessions.filter(
            (s) => s.sessionId !== targetSessionId
          );
          if (remainingSessions.length > 0) {
            router.push(`/council/${remainingSessions[0].sessionId}`);
          } else {
            router.push("/council");
          }
        }
      }
    },
    [removeSession, loadSessions, sessions, sessionId, router]
  );

  const handleMessageSent = useCallback(() => {
    loadSessions();
  }, [loadSessions]);

  return (
    <div className="h-screen flex">
      <CouncilSidebar
        sessions={sessions}
        currentSessionId={sessionId}
        isLoading={sessionsLoading}
        onSelectSession={handleSelectSession}
        onNewSession={handleNewSession}
        onDeleteSession={handleDeleteSession}
      />

      {/* Main chat area */}
      <div className="flex-1 flex flex-col bg-slate-900">
        {/* Messages area */}
        <div className="flex-1 overflow-y-auto p-4 scrollbar-custom">
          <MessageList />
        </div>

        {/* Input area */}
        <InputArea sessionId={sessionId} onMessageSent={handleMessageSent} />
      </div>
    </div>
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
