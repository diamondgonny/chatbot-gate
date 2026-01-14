/**
 * Council Messages Context
 * Stream이나 status 변경 시 불필요한 re-render를 방지하기 위해
 * message state를 분리된 context로 관리
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
import type { CouncilMessage } from "../types";

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

// undefined 기본값으로 context 생성
const CouncilMessagesContext = createContext<
  CouncilMessagesContextValue | undefined
>(undefined);

interface CouncilMessagesProviderProps {
  children: ReactNode;
}

/**
 * Stream/status 변경으로 인한 re-render를 방지하기 위해
 * 분리된 message state 제공
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
 * CouncilMessagesProvider 내에서만 사용 가능
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
