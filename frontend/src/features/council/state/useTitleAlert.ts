"use client";

import { useRef, useCallback, useEffect } from "react";

/**
 * 알림으로 브라우저 tab title을 깜빡이게 하는 Hook
 * 사용자가 tab으로 돌아오면 자동으로 중지
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
    if (intervalRef.current) return; // 중복 alert 방지

    originalTitleRef.current = document.title;

    intervalRef.current = setInterval(() => {
      document.title =
        document.title === originalTitleRef.current
          ? message
          : originalTitleRef.current;
    }, 500);
  }, []);

  // 사용자가 tab으로 돌아올 때 alert 자동 중지
  useEffect(() => {
    const handleVisibility = () => {
      if (!document.hidden) {
        stopAlert();
      }
    };

    document.addEventListener("visibilitychange", handleVisibility);
    return () => {
      document.removeEventListener("visibilitychange", handleVisibility);
      stopAlert(); // Unmount 시 정리
    };
  }, [stopAlert]);

  return { startAlert, stopAlert };
}
