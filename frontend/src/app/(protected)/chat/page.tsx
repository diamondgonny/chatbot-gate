'use client';

import { useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from "framer-motion";
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { useSessions, useChat } from "@/hooks";
import SessionSidebar from "@/components/chat/SessionSidebar";
import AlertModal from "@/components/common/AlertModal";
import type { Message } from "@/types";
import { useState } from 'react';

export default function ChatInterface() {
  // Use custom hooks for state management
  const {
    sessions,
    setSessions,
    currentSessionId,
    setCurrentSessionId,
    loadingSessionId,
    setLoadingSessionId,
    sessionError,
    setSessionError,
    loadSessions,
    handleCreateSession,
    handleDeleteSession,
    sortSessionsByUpdatedAt,
  } = useSessions();

  const {
    messages,
    setMessages,
    input,
    setInput,
    isTyping,
    isLoading,
    setIsLoading,
    messagesEndRef,
    intendedSessionRef,
    loadChatHistory,
    sendMessage,
  } = useChat();

  // Local state for delete modal
  const [sessionToDelete, setSessionToDelete] = useState<string | null>(null);

  // Keep sidebar titles in sync with latest message content
  useEffect(() => {
    if (messages.length === 0) return;

    const targetSessionId = intendedSessionRef.current;
    if (!targetSessionId) return;

    const latestMessage = messages[messages.length - 1];

    setSessions((prev) => {
      const updated = prev.map((session) =>
        session.sessionId === targetSessionId
          ? {
              ...session,
              lastMessage: {
                content: latestMessage.content,
                role: latestMessage.role,
                timestamp: latestMessage.timestamp,
              },
              title: latestMessage.content,
              updatedAt: latestMessage.timestamp,
            }
          : session
      );
      return sortSessionsByUpdatedAt(updated);
    });
  // Note: intendedSessionRef is a ref (stable), so not needed in dependencies
  }, [messages, setSessions, sortSessionsByUpdatedAt]);

  // Auto-dismiss session error after 10 seconds
  useEffect(() => {
    if (sessionError) {
      const timer = setTimeout(() => {
        setSessionError(null);
      }, 10000);
      return () => clearTimeout(timer);
    }
  }, [sessionError, setSessionError]);

  // Load chat history on mount
  useEffect(() => {
    const loadOnMount = async () => {
      try {
        // loadSessions now returns sorted sessions
        const sortedSessions = await loadSessions();

        if (sortedSessions.length > 0) {
          const latestSession = sortedSessions[0];
          intendedSessionRef.current = latestSession.sessionId;
          setCurrentSessionId(latestSession.sessionId);

          const loadedMessages = await loadChatHistory(latestSession.sessionId);
          setMessages(loadedMessages);
        } else {
          setCurrentSessionId(null);
          setMessages([]);
        }
      } catch (error) {
        console.error("Error loading chat history:", error);
        setMessages([]);
      } finally {
        setIsLoading(false);
      }
    };

    loadOnMount();
  }, [loadSessions, setCurrentSessionId, setMessages, setIsLoading, loadChatHistory, intendedSessionRef]);

  const handleSendMessage = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim()) return;

    let sessionId = currentSessionId;

    // Lazily create a session if none exists
    if (!sessionId) {
      const newSession = await handleCreateSession();
      if (!newSession) return;

      sessionId = newSession.sessionId;
      intendedSessionRef.current = sessionId;
      setCurrentSessionId(sessionId);
      setSessions((prev) => [newSession, ...prev]);
    }

    const userMessage: Message = {
      id: Date.now().toString(),
      role: "user",
      content: input,
      timestamp: new Date().toISOString(),
    };

    setMessages((prev) => [...prev, userMessage]);
    setInput("");

    const aiMessage = await sendMessage(input, sessionId);
    if (aiMessage) {
      setMessages((prev) => [...prev, aiMessage]);
    }
  }, [
    input,
    currentSessionId,
    handleCreateSession,
    setCurrentSessionId,
    setSessions,
    setMessages,
    setInput,
    sendMessage,
    intendedSessionRef,
  ]);

  const handleNewChat = useCallback(async () => {
    const newSession = await handleCreateSession();
    if (!newSession) return;

    intendedSessionRef.current = newSession.sessionId;
    setCurrentSessionId(newSession.sessionId);
    setMessages([]);
    await loadSessions();
  }, [handleCreateSession, setCurrentSessionId, setMessages, loadSessions, intendedSessionRef]);

  const handleSessionSelect = useCallback(async (sessionId: string) => {
    if (sessionId === currentSessionId) return;

    try {
      setLoadingSessionId(sessionId);
      intendedSessionRef.current = sessionId;
      setCurrentSessionId(sessionId);

      const loadedMessages = await loadChatHistory(sessionId);
      setMessages(loadedMessages);
    } catch (error) {
      console.error("Error loading session:", error);
    } finally {
      setLoadingSessionId(null);
    }
  }, [
    currentSessionId,
    setLoadingSessionId,
    setCurrentSessionId,
    loadChatHistory,
    setMessages,
    intendedSessionRef,
  ]);

  const handleDeleteClick = useCallback((sessionId: string) => {
    setSessionToDelete(sessionId);
  }, []);

  const confirmDeleteSession = useCallback(async () => {
    if (!sessionToDelete) return;

    try {
      await handleDeleteSession(sessionToDelete);
      const updatedSessions = await loadSessions();

      if (currentSessionId === sessionToDelete) {
        const remainingSessions = updatedSessions.filter(
          (s) => s.sessionId !== sessionToDelete
        );
        if (remainingSessions.length > 0) {
          await handleSessionSelect(remainingSessions[0].sessionId);
        } else {
          await handleNewChat();
        }
      }
    } catch (error) {
      console.error("Error deleting session:", error);
    } finally {
      setSessionToDelete(null);
    }
  }, [
    sessionToDelete,
    handleDeleteSession,
    loadSessions,
    currentSessionId,
    handleSessionSelect,
    handleNewChat,
  ]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-slate-400">Loading chat...</div>
      </div>
    );
  }

  return (
    <div className="flex h-screen">
      {/* Session Sidebar */}
      <SessionSidebar
        sessions={sessions}
        currentSessionId={currentSessionId || undefined}
        onSessionSelect={handleSessionSelect}
        onDeleteSession={handleDeleteClick}
        onNewChat={handleNewChat}
        loadingSessionId={loadingSessionId || undefined}
      />

      {/* Chat Interface */}
      <div className="flex flex-col flex-1 bg-slate-900/50 shadow-2xl border-x border-slate-800">
        {/* Header */}
        <header className="p-4 border-b border-slate-800 bg-slate-900/80 backdrop-blur-md sticky top-0 z-10 min-h-[88px] flex flex-col justify-center">
          <h2 className="text-xl font-semibold text-slate-200">
            AI Chat Session
          </h2>
          <p className="text-xs text-slate-500">Connected to Joonman AI</p>
        </header>

        {sessionError && (
          <div className="mx-4 mt-3 mb-2 rounded-lg border border-amber-500/60 bg-amber-500/10 text-amber-100 px-4 py-2 text-sm">
            {sessionError}
          </div>
        )}

        {/* Messages Area */}
        <div className="flex-1 overflow-y-auto p-4 space-y-6 scrollbar-custom">
          {messages.map((msg) => (
            <motion.div
              key={msg.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className={clsx(
                "flex w-full",
                msg.role === "user" ? "justify-end" : "justify-start"
              )}
            >
              <div
                className={twMerge(
                  "max-w-[80%] p-4 rounded-2xl text-sm leading-relaxed shadow-sm",
                  msg.role === "user"
                    ? "bg-blue-600 text-white rounded-br-none"
                    : "bg-slate-800 text-slate-200 rounded-bl-none border border-slate-700"
                )}
              >
                {msg.content}
              </div>
            </motion.div>
          ))}

          {/* Typing Indicator */}
          <AnimatePresence>
            {isTyping && (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.9 }}
                className="flex justify-start w-full"
              >
                <div className="bg-slate-800 border border-slate-700 p-4 rounded-2xl rounded-bl-none flex gap-2 items-center">
                  <span className="w-2 h-2 bg-slate-500 rounded-full animate-bounce [animation-delay:-0.3s]" />
                  <span className="w-2 h-2 bg-slate-500 rounded-full animate-bounce [animation-delay:-0.15s]" />
                  <span className="w-2 h-2 bg-slate-500 rounded-full animate-bounce" />
                </div>
              </motion.div>
            )}
          </AnimatePresence>
          <div ref={messagesEndRef} />
        </div>

        {/* Input Area */}
        <form
          onSubmit={handleSendMessage}
          className="p-4 border-t border-slate-800 bg-slate-900/80 backdrop-blur-md"
        >
          <div className="relative flex items-center max-w-4xl mx-auto">
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Type your message..."
              maxLength={1024}
              className="w-full bg-slate-800 text-slate-200 placeholder-slate-500 rounded-full py-3 px-6 pr-12 focus:outline-none focus:ring-2 focus:ring-blue-500/50 transition-all"
            />
            <button
              type="submit"
              disabled={!input.trim() || isTyping}
              className="absolute right-2 p-2 bg-blue-600 text-white rounded-full hover:bg-blue-500 disabled:opacity-50 disabled:hover:bg-blue-600 transition-colors"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 24 24"
                fill="currentColor"
                className="w-5 h-5"
              >
                <path d="M3.478 2.404a.75.75 0 0 0-.926.941l2.432 7.905H13.5a.75.75 0 0 1 0 1.5H4.984l-2.432 7.905a.75.75 0 0 0 .926.94 60.519 60.519 0 0 0 18.445-8.986.75.75 0 0 0 0-1.218A60.517 60.517 0 0 0 3.478 2.404Z" />
              </svg>
            </button>
          </div>
        </form>
      </div>

      {/* Delete Confirmation Modal */}
      <AlertModal
        isOpen={!!sessionToDelete}
        title="Delete chat"
        message="Are you sure you want to delete this chat? This action cannot be undone."
        confirmText="Delete"
        cancelText="Cancel"
        isDestructive={true}
        onClose={() => setSessionToDelete(null)}
        onConfirm={confirmDeleteSession}
      />
    </div>
  );
}
