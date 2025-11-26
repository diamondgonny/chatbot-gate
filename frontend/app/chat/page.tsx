'use client';

import { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from "framer-motion";
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';
import axios from "axios";
import { getAuth, getAuthHeaders } from "@/lib/authUtils";
import { withAuth } from "@/components/withAuth";

interface Message {
  id: string;
  role: 'user' | 'ai';
  content: string;
  timestamp: string;
}

function ChatInterface() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isTyping, setIsTyping] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, isTyping]);

  // Load chat history on mount
  useEffect(() => {
    const loadChatHistory = async () => {
      try {
        const response = await axios.get(
          "http://localhost:4000/api/chat/history",
          { headers: getAuthHeaders() }
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
          // No history, add welcome message
          setMessages([
            {
              id: "welcome",
              role: "ai",
              content: "Hello! I am the Gatekeeper AI. What brings you here?",
              timestamp: new Date().toISOString(),
            },
          ]);
        }
      } catch (error) {
        console.error("Error loading chat history:", error);
        // Add welcome message on error
        setMessages([
          {
            id: "welcome",
            role: "ai",
            content: "Hello! I am the Gatekeeper AI. What brings you here?",
            timestamp: new Date().toISOString(),
          },
        ]);
      } finally {
        setIsLoading(false);
      }
    };

    loadChatHistory();
  }, []);

  const sendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim()) return;

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
      // Standard POST request with JWT authentication
      const response = await axios.post(
        "http://localhost:4000/api/chat/message",
        {
          message: userMessage.content,
        },
        {
          headers: getAuthHeaders(),
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

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-slate-400">Loading chat...</div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-screen max-w-3xl mx-auto bg-slate-900/50 shadow-2xl border-x border-slate-800">
      {/* Header */}
      <header className="p-4 border-b border-slate-800 bg-slate-900/80 backdrop-blur-md sticky top-0 z-10">
        <h2 className="text-xl font-semibold text-slate-200">
          AI Chat Session
        </h2>
        <p className="text-xs text-slate-500">Connected to Gatekeeper Node</p>
      </header>

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
  );
}

export default withAuth(ChatInterface);
