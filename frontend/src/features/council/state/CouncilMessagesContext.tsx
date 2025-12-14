/**
 * Council Messages Context
 * Isolated context for message state to prevent unnecessary re-renders
 * when stream or status changes.
 */

"use client";

import {
  createContext,
  useContext,
  useState,
  useCallback,
  useMemo,
  type ReactNode,
} from "react";
import type { CouncilMessage } from "../domain";

/**
 * Messages context value shape
 */
export interface CouncilMessagesContextValue {
  // State
  messages: CouncilMessage[];
  pendingMessage: string | null;

  // Actions
  setMessages: (
    messages: CouncilMessage[] | ((prev: CouncilMessage[]) => CouncilMessage[])
  ) => void;
  addMessage: (message: CouncilMessage) => void;
  setPendingMessage: (msg: string | null) => void;
  clearMessages: () => void;
}

// Create context with undefined default
const CouncilMessagesContext = createContext<
  CouncilMessagesContextValue | undefined
>(undefined);

/**
 * Props for CouncilMessagesProvider
 */
interface CouncilMessagesProviderProps {
  children: ReactNode;
}

/**
 * Council Messages Provider
 * Provides isolated message state to prevent re-renders from stream/status changes
 */
export function CouncilMessagesProvider({
  children,
}: CouncilMessagesProviderProps) {
  const [messages, setMessagesState] = useState<CouncilMessage[]>([]);
  const [pendingMessage, setPendingMessage] = useState<string | null>(null);

  const setMessages = useCallback(
    (
      newMessages:
        | CouncilMessage[]
        | ((prev: CouncilMessage[]) => CouncilMessage[])
    ) => {
      setMessagesState(newMessages);
    },
    []
  );

  const addMessage = useCallback((message: CouncilMessage) => {
    setMessagesState((prev) => [...prev, message]);
  }, []);

  const clearMessages = useCallback(() => {
    setMessagesState([]);
    setPendingMessage(null);
  }, []);

  const contextValue = useMemo<CouncilMessagesContextValue>(
    () => ({
      messages,
      pendingMessage,
      setMessages,
      addMessage,
      setPendingMessage,
      clearMessages,
    }),
    [messages, pendingMessage, setMessages, addMessage, clearMessages]
  );

  return (
    <CouncilMessagesContext.Provider value={contextValue}>
      {children}
    </CouncilMessagesContext.Provider>
  );
}

/**
 * Hook to access council messages context
 * Must be used within a CouncilMessagesProvider
 */
export function useCouncilMessagesContext(): CouncilMessagesContextValue {
  const context = useContext(CouncilMessagesContext);
  if (context === undefined) {
    throw new Error(
      "useCouncilMessagesContext must be used within a CouncilMessagesProvider"
    );
  }
  return context;
}
