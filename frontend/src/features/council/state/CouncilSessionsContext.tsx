/**
 * Council Sessions Context Provider
 * Manages session list state separately from individual session state
 * This allows the sidebar to persist across session navigation
 */

"use client";

import { createContext, useContext, type ReactNode } from "react";
import { useCouncilSessions as useCouncilSessionsHook } from "./useCouncilSessions";
import type { CouncilSession } from "../domain";

/**
 * Council sessions context value shape
 */
export interface CouncilSessionsContextValue {
  sessions: CouncilSession[];
  isLoading: boolean;
  isCreating: boolean;
  error: string | null;
  loadSessions: () => Promise<void>;
  createSession: () => Promise<string | null>;
  removeSession: (sessionId: string) => Promise<boolean>;
  updateSessionTitle: (sessionId: string, title: string) => void;
  updateSessionTimestamp: (sessionId: string) => void;
}

// Create context with undefined default (must be used within provider)
const CouncilSessionsContext = createContext<
  CouncilSessionsContextValue | undefined
>(undefined);

/**
 * Props for CouncilSessionsProvider
 */
interface CouncilSessionsProviderProps {
  children: ReactNode;
}

/**
 * Council Sessions Provider component
 * Wraps children with session list state
 * Place this at the layout level to persist sessions across page navigation
 */
export function CouncilSessionsProvider({
  children,
}: CouncilSessionsProviderProps) {
  const sessionsState = useCouncilSessionsHook();

  return (
    <CouncilSessionsContext.Provider value={sessionsState}>
      {children}
    </CouncilSessionsContext.Provider>
  );
}

/**
 * Hook to access council sessions context
 * Must be used within a CouncilSessionsProvider
 */
export function useCouncilSessionsContext(): CouncilSessionsContextValue {
  const context = useContext(CouncilSessionsContext);
  if (context === undefined) {
    throw new Error(
      "useCouncilSessionsContext must be used within a CouncilSessionsProvider"
    );
  }
  return context;
}
