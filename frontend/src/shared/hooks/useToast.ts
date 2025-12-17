"use client";

import { useState, useCallback, useRef, useEffect } from "react";

export type ToastType = "error" | "success" | "info";

export interface Toast {
  id: string;
  message: string;
  type: ToastType;
}

export function useToast() {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const timeoutRefs = useRef<Map<string, NodeJS.Timeout>>(new Map());

  const removeToast = useCallback((id: string) => {
    const timeoutId = timeoutRefs.current.get(id);
    if (timeoutId) {
      clearTimeout(timeoutId);
      timeoutRefs.current.delete(id);
    }
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const showToast = useCallback(
    (message: string, type: ToastType = "info") => {
      const id = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      setToasts((prev) => [...prev, { id, message, type }]);

      // 3초 후 자동 제거
      const timeoutId = setTimeout(() => {
        removeToast(id);
      }, 3000);
      timeoutRefs.current.set(id, timeoutId);

      return id;
    },
    [removeToast]
  );

  // Unmount 시 timeout 정리
  useEffect(() => {
    const currentTimeouts = timeoutRefs.current;
    return () => {
      currentTimeouts.forEach((timeoutId) => clearTimeout(timeoutId));
      currentTimeouts.clear();
    };
  }, []);

  return { toasts, showToast, removeToast };
}
