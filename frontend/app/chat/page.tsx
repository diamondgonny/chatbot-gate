'use client';

import { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from "framer-motion";
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';
import axios from "axios";
import { withAuth } from "@/components/withAuth";
import SessionSidebar from "@/components/SessionSidebar";
import AlertModal from "@/components/AlertModal";

interface Message {
  id: string;
  role: "user" | "ai";
  content: string;
  timestamp: string;
}

interface Session {
  sessionId: string;
  title: string;
  lastMessage: {
    content: string;
    role: string;
    timestamp: string;
  } | null;
  updatedAt: string;
}

function ChatInterface() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isTyping, setIsTyping] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [sessionToDelete, setSessionToDelete] = useState<string | null>(null);
  const [sessionError, setSessionError] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, isTyping]);

  // Keep sidebar titles in sync with latest message content
  useEffect(() => {
    if (!currentSessionId || messages.length === 0) return;
    const latestMessage = messages[messages.length - 1];

    setSessions((prev) =>
      prev.map((session) =>
        session.sessionId === currentSessionId
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
      )
    );
  }, [messages, currentSessionId]);

  // Load sessions from API
  const loadSessions = async (): Promise<Session[]> => {
    try {
      const response = await axios.get("http://localhost:4000/api/sessions", {
        withCredentials: true,
      });
      const fetchedSessions: Session[] = response.data.sessions || [];
      setSessions(fetchedSessions);
      return fetchedSessions;
    } catch (error) {
      console.error("Error loading sessions:", error);
      return [];
    }
  };

  // Load chat history on mount - create first session if none exists
  useEffect(() => {
    const loadChatHistory = async () => {
      try {
        // Get user's sessions first
        const sessionsResponse = await axios.get(
          "http://localhost:4000/api/sessions",
          { withCredentials: true }
        );
        const fetchedSessions: Session[] = sessionsResponse.data.sessions || [];
        setSessions(fetchedSessions);

        if (fetchedSessions.length > 0) {
          // Use the most recent session
          const latestSession = fetchedSessions[0];
          setCurrentSessionId(latestSession.sessionId);

          // Load history for this session
          const historyResponse = await axios.get(
            `http://localhost:4000/api/chat/history?sessionId=${latestSession.sessionId}`,
            { withCredentials: true }
          );

          if (
            historyResponse.data.messages &&
            historyResponse.data.messages.length > 0
          ) {
            const loadedMessages = historyResponse.data.messages.map(
              (msg: any, idx: number) => ({
                id: `loaded_${idx}`,
                role: msg.role === "ai" ? "ai" : "user",
                content: msg.content,
                timestamp: msg.timestamp,
              })
            );
            setMessages(loadedMessages);
          }
        } else {
          // No sessions exist; wait until user sends a message to create one
          setCurrentSessionId(null);
          setMessages([]);
        }
      } catch (error) {
        console.error("Error loading chat history:", error);
        // Keep empty state on error; user can start chatting
        setMessages([]);
      } finally {
        setIsLoading(false);
      }
    };

    loadChatHistory();
  }, []);

  const sendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim()) return;

    // Lazily create a session if none exists yet
    let sessionId = currentSessionId;
    if (!sessionId) {
      try {
        const newSessionResponse = await axios.post(
          "http://localhost:4000/api/sessions",
          {},
          { withCredentials: true }
        );
        sessionId = newSessionResponse.data.sessionId;
        setCurrentSessionId(sessionId);
        setSessions((prev) => [
          {
            sessionId,
            title: newSessionResponse.data.title || "New Chat",
            lastMessage: null,
            updatedAt: newSessionResponse.data.updatedAt,
          },
          ...prev,
        ]);
      } catch (error) {
        console.error("Error creating session:", error);
        return;
      }
    }

    const userMessage: Message = {
      id: Date.now().toString(),
      role: "user",
      content: input,
      timestamp: new Date().toISOString(),
    };

    setMessages((prev) => [...prev, userMessage]);
    setInput("");
    setIsTyping(true);

    try {
      // Standard POST request with JWT authentication via cookies
      const response = await axios.post(
        "http://localhost:4000/api/chat/message",
        {
          message: userMessage.content,
          sessionId,
        },
        {
          withCredentials: true,
        }
      );

      const aiMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: "ai",
        content: response.data.response,
        timestamp: response.data.timestamp,
      };

      setMessages((prev) => [...prev, aiMessage]);
    } catch (error) {
      console.error("Error sending message:", error);
      const errorMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: "ai",
        content: "Sorry, something went wrong.",
        timestamp: new Date().toISOString(),
      };
      setMessages((prev) => [...prev, errorMessage]);
    } finally {
      setIsTyping(false);
    }
  };

  const handleNewChat = async () => {
    try {
      // Create new session via API
      const response = await axios.post(
        "http://localhost:4000/api/sessions",
        {},
        { withCredentials: true }
      );

      setCurrentSessionId(response.data.sessionId);
      setMessages([]); // Start with empty messages

      // Reload sessions to update sidebar
      await loadSessions();
    } catch (error) {
      console.error("Error creating new session:", error);
      if (axios.isAxiosError(error) && error.response?.status === 429) {
        const limit = (error.response.data as any)?.limit;
        const count = (error.response.data as any)?.count;
        const msg =
          (error.response.data as any)?.error ||
          "Too many sessions. Please delete an existing session.";
        setSessionError(
          limit
            ? `${msg} (${count || limit}/${limit})`
            : msg
        );
        return;
      }
      setSessionError("Failed to create a new session. Please try again.");
    }
  };

  const handleSessionSelect = async (sessionId: string) => {
    try {
      setCurrentSessionId(sessionId);

      // Load history for selected session
      const response = await axios.get(
        `http://localhost:4000/api/chat/history?sessionId=${sessionId}`,
        { withCredentials: true }
      );

      if (response.data.messages && response.data.messages.length > 0) {
        const loadedMessages = response.data.messages.map(
          (msg: any, idx: number) => ({
            id: `loaded_${idx}`,
            role: msg.role === "ai" ? "ai" : "user",
            content: msg.content,
            timestamp: msg.timestamp,
          })
        );
        setMessages(loadedMessages);
      } else {
        setMessages([]);
      }
    } catch (error) {
      console.error("Error loading session:", error);
    }
  };

  const handleDeleteClick = (sessionId: string) => {
    setSessionToDelete(sessionId);
  };

  const confirmDeleteSession = async () => {
    if (!sessionToDelete) return;

    try {
      await axios.delete(
        `http://localhost:4000/api/sessions/${sessionToDelete}`,
        { withCredentials: true }
      );

      // Reload sessions to update sidebar
      const updatedSessions = await loadSessions();

      // If deleted session was the current one, switch using fresh data
      if (currentSessionId === sessionToDelete) {
        const remainingSessions = updatedSessions.filter(
          (s) => s.sessionId !== sessionToDelete
        );
        if (remainingSessions.length > 0) {
          // Switch to the first remaining session
          await handleSessionSelect(remainingSessions[0].sessionId);
        } else {
          // No sessions left, create a new one
          await handleNewChat();
        }
      }
    } catch (error) {
      console.error("Error deleting session:", error);
    } finally {
      setSessionToDelete(null);
    }
  };

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
      />

      {/* Chat Interface */}
      <div className="flex flex-col flex-1 bg-slate-900/50 shadow-2xl border-x border-slate-800">
        {/* Header */}
        <header className="p-4 border-b border-slate-800 bg-slate-900/80 backdrop-blur-md sticky top-0 z-10 min-h-[88px] flex flex-col justify-center">
          <h2 className="text-xl font-semibold text-slate-200">AI Chat Session</h2>
          <p className="text-xs text-slate-500">Connected to Gatekeeper Node</p>
        </header>

        {sessionError && (
          <div className="mx-4 mt-3 mb-2 rounded-lg border border-amber-500/60 bg-amber-500/10 text-amber-100 px-4 py-2 text-sm">
            {sessionError}
          </div>
        )}

        {/* Messages Area */}
        <div className="flex-1 overflow-y-auto p-4 space-y-6 scrollbar-thin scrollbar-thumb-slate-700 scrollbar-track-transparent">
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
          onSubmit={sendMessage}
          className="p-4 border-t border-slate-800 bg-slate-900/80 backdrop-blur-md"
        >
          <div className="relative flex items-center">
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Type your message..."
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
        title="채팅 삭제"
        message="정말로 이 채팅을 삭제하시겠습니까? 이 작업은 되돌릴 수 없습니다."
        confirmText="삭제"
        cancelText="취소"
        isDestructive={true}
        onClose={() => setSessionToDelete(null)}
        onConfirm={confirmDeleteSession}
      />
    </div>
  );
}

export default withAuth(ChatInterface);
