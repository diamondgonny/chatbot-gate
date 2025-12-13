"use client";

import { useRef, useCallback, useEffect } from "react";

/**
 * Hook for flashing the browser tab title as a notification
 * Automatically stops when the user returns to the tab
 */
export function useTitleAlert() {
  const originalTitleRef = useRef<string>("");
  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  const stopAlert = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    if (originalTitleRef.current) {
      document.title = originalTitleRef.current;
    }
  }, []);

  const startAlert = useCallback((message: string) => {
    if (intervalRef.current) return; // Prevent duplicate alerts

    originalTitleRef.current = document.title;

    intervalRef.current = setInterval(() => {
      document.title =
        document.title === originalTitleRef.current
          ? message
          : originalTitleRef.current;
    }, 500);
  }, []);

  // Auto-stop alert when user returns to tab
  useEffect(() => {
    const handleVisibility = () => {
      if (!document.hidden) {
        stopAlert();
      }
    };

    document.addEventListener("visibilitychange", handleVisibility);
    return () => {
      document.removeEventListener("visibilitychange", handleVisibility);
      stopAlert(); // Cleanup on unmount
    };
  }, [stopAlert]);

  return { startAlert, stopAlert };
}
