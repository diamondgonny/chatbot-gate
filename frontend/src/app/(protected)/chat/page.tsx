'use client';

import { useMemo, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { useChatPageOrchestration, SessionSidebar } from "@/features/chat";
import { AlertModal, ToastContainer } from "@/shared";
import { useToast } from "@/shared/hooks";

export default function ChatInterface() {
  const { toasts, showToast, removeToast } = useToast();
  const prevSessionErrorRef = useRef<string | null>(null);

  const callbacks = useMemo(() => ({
    onDeleteError: (message: string) => showToast(message, "error"),
  }), [showToast]);

  const {
    isLoading,
    loadingSessionId,
    isCreating,
    sessions,
    currentSessionId,
    sessionError,
    messages,
    input,
    setInput,
    isTyping,
    messagesEndRef,
    sessionToDelete,
    handleSendMessage,
    handleNewChat,
    handleSessionSelect,
    requestDeleteSession,
    confirmDeleteSession,
    cancelDeleteSession,
  } = useChatPageOrchestration({}, callbacks);

  // Session 생성 실패 시 toast 표시
  useEffect(() => {
    if (sessionError && sessionError !== prevSessionErrorRef.current) {
      showToast(sessionError, "error");
    }
    prevSessionErrorRef.current = sessionError;
  }, [sessionError, showToast]);

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
        onDeleteSession={requestDeleteSession}
        onNewChat={handleNewChat}
        loadingSessionId={loadingSessionId || undefined}
        isCreating={isCreating}
      />

      {/* Chat Interface */}
      <div className="flex flex-col flex-1 bg-slate-900/50 shadow-2xl border-x border-slate-800">
        {/* 헤더 */}
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

        {/* Message 영역 */}
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

          {/* Typing 표시 */}
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

        {/* Input 영역 */}
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

      {/* 삭제 확인 Modal */}
      <AlertModal
        isOpen={!!sessionToDelete}
        title="Delete chat"
        message="Are you sure you want to delete this chat? This action cannot be undone."
        confirmText="Delete"
        cancelText="Cancel"
        isDestructive={true}
        onClose={cancelDeleteSession}
        onConfirm={confirmDeleteSession}
      />

      {/* Toast 알림 */}
      <ToastContainer toasts={toasts} onRemove={removeToast} />
    </div>
  );
}
