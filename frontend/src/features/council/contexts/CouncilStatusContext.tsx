/**
 * Council Status Context
 * Message나 stream 변경 시 불필요한 re-render를 방지하기 위해
 * status flag를 분리된 context로 관리
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

export interface CouncilStatusContextValue {
  // State
  isProcessing: boolean;
  isReconnecting: boolean;
  wasAborted: boolean;
  isLoading: boolean;
  error: string | null;
  isInputExpanded: boolean;

  // Actions
  setProcessing: (isProcessing: boolean) => void;
  setReconnecting: (isReconnecting: boolean) => void;
  setAborted: (wasAborted: boolean) => void;
  setLoading: (isLoading: boolean) => void;
  setError: (error: string | null) => void;
  setInputExpanded: (isExpanded: boolean) => void;
  resetStatus: () => void;
}

// undefined 기본값으로 context 생성
const CouncilStatusContext = createContext<
  CouncilStatusContextValue | undefined
>(undefined);

interface CouncilStatusProviderProps {
  children: ReactNode;
}

/**
 * Message/stream 변경으로 인한 re-render를 방지하기 위해
 * 분리된 status state 제공
 */
export function CouncilStatusProvider({
  children,
}: CouncilStatusProviderProps) {
  const [isProcessing, setIsProcessing] = useState(false);
  const [isReconnecting, setIsReconnecting] = useState(false);
  const [wasAborted, setWasAborted] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isInputExpanded, setIsInputExpanded] = useState(false);

  const setProcessing = useCallback((processing: boolean) => {
    setIsProcessing(processing);
  }, []);

  const setReconnecting = useCallback((reconnecting: boolean) => {
    setIsReconnecting(reconnecting);
  }, []);

  const setAborted = useCallback((aborted: boolean) => {
    setWasAborted(aborted);
  }, []);

  const setLoading = useCallback((loading: boolean) => {
    setIsLoading(loading);
  }, []);

  const setInputExpanded = useCallback((expanded: boolean) => {
    setIsInputExpanded(expanded);
  }, []);

  const resetStatus = useCallback(() => {
    setIsProcessing(false);
    setIsReconnecting(false);
    setWasAborted(false);
    setIsLoading(false);
    setError(null);
    setIsInputExpanded(false);
  }, []);

  const contextValue = useMemo<CouncilStatusContextValue>(
    () => ({
      isProcessing,
      isReconnecting,
      wasAborted,
      isLoading,
      error,
      isInputExpanded,
      setProcessing,
      setReconnecting,
      setAborted,
      setLoading,
      setError,
      setInputExpanded,
      resetStatus,
    }),
    [
      isProcessing,
      isReconnecting,
      wasAborted,
      isLoading,
      error,
      isInputExpanded,
      setProcessing,
      setReconnecting,
      setAborted,
      setLoading,
      setInputExpanded,
      resetStatus,
    ]
  );

  return (
    <CouncilStatusContext.Provider value={contextValue}>
      {children}
    </CouncilStatusContext.Provider>
  );
}

/**
 * CouncilStatusProvider 내에서만 사용 가능
 */
export function useCouncilStatusContext(): CouncilStatusContextValue {
  const context = useContext(CouncilStatusContext);
  if (context === undefined) {
    throw new Error(
      "useCouncilStatusContext must be used within a CouncilStatusProvider"
    );
  }
  return context;
}
