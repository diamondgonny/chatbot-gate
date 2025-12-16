"use client";

import { motion, AnimatePresence } from "framer-motion";

interface AlertModalProps {
  isOpen: boolean;
  title: string;
  message?: string;
  confirmText?: string;
  cancelText?: string;
  isDestructive?: boolean;
  onClose: () => void;
  onConfirm: () => void;
}

export default function AlertModal({
  isOpen,
  title,
  message,
  confirmText = "확인",
  cancelText = "취소",
  isDestructive = false,
  onClose,
  onConfirm,
}: AlertModalProps) {
  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
          />

          {/* Modal */}
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            className="relative w-full max-w-sm bg-slate-800 border border-slate-700 rounded-xl shadow-2xl overflow-hidden"
          >
            <div className="p-5 pb-0">
              <h3 className="text-lg font-semibold text-slate-100 mb-2">
                {title}
              </h3>
              {message && (
                <p className="text-slate-400 text-sm leading-relaxed">
                  {message}
                </p>
              )}
            </div>

            <div className="flex items-center justify-end gap-3 p-5">
              <button
                onClick={onClose}
                className="cursor-pointer px-4 py-2 text-sm font-medium text-slate-300 bg-slate-700 hover:bg-slate-600 rounded-lg transition-colors"
              >
                {cancelText}
              </button>
              <button
                onClick={onConfirm}
                className={`cursor-pointer px-4 py-2 text-sm font-medium text-white rounded-lg transition-colors shadow-lg ${
                  isDestructive
                    ? "bg-red-600 hover:bg-red-500 shadow-red-900/20"
                    : "bg-blue-600 hover:bg-blue-500 shadow-blue-900/20"
                }`}
              >
                {confirmText}
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
