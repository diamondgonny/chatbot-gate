"use client";

import { useEffect } from "react";

/**
 * Auto-dismisses an error after a specified timeout.
 * Returns nothing - this is a pure side-effect hook.
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
