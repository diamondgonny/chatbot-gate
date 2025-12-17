"use client";

import { useEffect } from "react";

/**
 * 지정된 timeout 후 error를 자동으로 제거
 * 반환값 없음 - 순수 side-effect hook
 */
export function useAutoError(
  error: string | null,
  clearError: () => void,
  timeoutMs: number = 10000
): void {
  useEffect(() => {
    if (error) {
      const timer = setTimeout(() => {
        clearError();
      }, timeoutMs);
      return () => clearTimeout(timer);
    }
  }, [error, clearError, timeoutMs]);
}
