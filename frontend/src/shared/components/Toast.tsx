"use client";

import { motion, AnimatePresence } from "framer-motion";
import type { Toast as ToastType, ToastType as ToastVariant } from "../hooks/useToast";

interface ToastContainerProps {
  toasts: ToastType[];
  onRemove: (id: string) => void;
}

const toastStyles: Record<ToastVariant, string> = {
  error: "bg-red-600 text-white",
  success: "bg-green-600 text-white",
  info: "bg-blue-600 text-white",
};

const toastIcons: Record<ToastVariant, string> = {
  error: "✕",
  success: "✓",
  info: "ℹ",
};

export function ToastContainer({ toasts, onRemove }: ToastContainerProps) {
  return (
    <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2">
      <AnimatePresence>
        {toasts.map((toast) => (
          <motion.div
            key={toast.id}
            initial={{ opacity: 0, x: 50, scale: 0.9 }}
            animate={{ opacity: 1, x: 0, scale: 1 }}
            exit={{ opacity: 0, x: 50, scale: 0.9 }}
            className={`flex items-center gap-3 px-4 py-3 rounded-lg shadow-lg min-w-[280px] max-w-[400px] ${toastStyles[toast.type]}`}
          >
            <span className="flex-shrink-0 w-5 h-5 flex items-center justify-center rounded-full bg-white/20 text-xs font-bold">
              {toastIcons[toast.type]}
            </span>
            <span className="flex-1 text-sm font-medium">{toast.message}</span>
            <button
              onClick={() => onRemove(toast.id)}
              className="flex-shrink-0 p-1 hover:bg-white/20 rounded transition-colors cursor-pointer"
              aria-label="Close"
            >
              <svg
                className="w-4 h-4"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M6 18L18 6M6 6l12 12"
                />
              </svg>
            </button>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}
