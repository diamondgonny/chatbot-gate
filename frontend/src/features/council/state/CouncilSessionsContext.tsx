/**
 * Council Sessions Context Provider
 * Session navigation 간에도 sidebar가 유지되도록
 * session list state를 개별 session state와 분리하여 관리
 */

"use client";

import { createContext, useContext, type ReactNode } from "react";
import { useCouncilSessions as useCouncilSessionsHook } from "./useCouncilSessions";
import type { CouncilSession } from "../domain";

export interface CouncilSessionsContextValue {
  sessions: CouncilSession[];
  isLoading: boolean;
  isCreating: boolean;
  error: string | null;
  loadSessions: () => Promise<void>;
  createSession: () => Promise<string | null>;
  removeSession: (sessionId: string) => Promise<boolean>;
  /** UI에서 낙관적으로 session 제거 (복원 가능하도록 제거된 session 반환) */
  removeSessionOptimistic: (sessionId: string) => CouncilSession | null;
  /** UI에 session 복원 (예: 삭제 실패 후) */
  restoreSession: (session: CouncilSession) => void;
  /** API 호출만 수행 (UI 업데이트 없음) */
  deleteSessionApi: (sessionId: string) => Promise<void>;
  updateSessionTitle: (sessionId: string, title: string) => void;
  updateSessionTimestamp: (sessionId: string) => void;
}

// Provider 내에서만 사용 가능 (undefined 기본값)
const CouncilSessionsContext = createContext<
  CouncilSessionsContextValue | undefined
>(undefined);

interface CouncilSessionsProviderProps {
  children: ReactNode;
}

/**
 * Page navigation 간 session을 유지하기 위해
 * layout 레벨에 배치
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
 * CouncilSessionsProvider 내에서만 사용 가능
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
