"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import {
  getChatHistory as defaultGetChatHistory,
  sendChatMessage as defaultSendChatMessage,
} from "../services";
import type {
  Message,
  ChatHistoryResponse,
  ChatMessageRequest,
  ChatMessageResponse,
} from "../types";

/**
 * Service interface for dependency injection.
 * Allows testing hooks without MSW by providing mock implementations.
 */
export interface ChatServices {
  getChatHistory: (sessionId: string) => Promise<ChatHistoryResponse>;
  sendChatMessage: (data: ChatMessageRequest) => Promise<ChatMessageResponse>;
}

const defaultServices: ChatServices = {
  getChatHistory: defaultGetChatHistory,
  sendChatMessage: defaultSendChatMessage,
};

export interface UseChatReturn {
  messages: Message[];
  setMessages: React.Dispatch<React.SetStateAction<Message[]>>;
  input: string;
  setInput: React.Dispatch<React.SetStateAction<string>>;
  isTyping: boolean;
  isLoading: boolean;
  setIsLoading: React.Dispatch<React.SetStateAction<boolean>>;
  messagesEndRef: React.RefObject<HTMLDivElement | null>;
  intendedSessionRef: React.MutableRefObject<string | null>;
  loadChatHistory: (sessionId: string) => Promise<Message[]>;
  sendMessage: (content: string, sessionId: string) => Promise<Message | null>;
  scrollToBottom: () => void;
}

export function useChat(services: ChatServices = defaultServices): UseChatReturn {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isTyping, setIsTyping] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const intendedSessionRef = useRef<string | null>(null);

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, []);

  // Auto-scroll on new messages
  useEffect(() => {
    scrollToBottom();
  }, [messages, isTyping, scrollToBottom]);

  const loadChatHistory = useCallback(async (sessionId: string): Promise<Message[]> => {
    try {
      const { messages: historyMessages } = await services.getChatHistory(sessionId);

      if (historyMessages && historyMessages.length > 0) {
        const loadedMessages: Message[] = historyMessages.map((msg, idx) => ({
          id: `loaded_${idx}`,
          role: msg.role === "ai" ? "ai" : "user",
          content: msg.content,
          timestamp: msg.timestamp,
        }));
        return loadedMessages;
      }
      return [];
    } catch (error) {
      console.error("Error loading chat history:", error);
      return [];
    }
  }, [services]);

  const sendMessage = useCallback(async (
    content: string,
    sessionId: string
  ): Promise<Message | null> => {
    setIsTyping(true);

    try {
      const { response, timestamp } = await services.sendChatMessage({
        message: content,
        sessionId,
      });

      const aiMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: "ai",
        content: response,
        timestamp,
      };

      return aiMessage;
    } catch (error) {
      console.error("Error sending message:", error);
      return {
        id: (Date.now() + 1).toString(),
        role: "ai",
        content: "Sorry, something went wrong.",
        timestamp: new Date().toISOString(),
      };
    } finally {
      setIsTyping(false);
    }
  }, [services]);

  return {
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
    scrollToBottom,
  };
}
