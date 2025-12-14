/**
 * Council Status Context
 * Isolated context for status flags to prevent unnecessary re-renders
 * when messages or stream changes.
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

/**
 * Status context value shape
 */
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

// Create context with undefined default
const CouncilStatusContext = createContext<
  CouncilStatusContextValue | undefined
>(undefined);

/**
 * Props for CouncilStatusProvider
 */
interface CouncilStatusProviderProps {
  children: ReactNode;
}

/**
 * Council Status Provider
 * Provides isolated status state to prevent re-renders from messages/stream changes
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
 * Hook to access council status context
 * Must be used within a CouncilStatusProvider
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
