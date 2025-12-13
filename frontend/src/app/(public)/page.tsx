"use client";

import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useRouter } from "next/navigation";
import { twMerge } from "tailwind-merge";
import { saveUserId, getUserId, checkAuthStatus, validateGateCode } from "@/shared";

export default function Gate() {
  const [code, setCode] = useState("");
  const [error, setError] = useState(false);
  const [loading, setLoading] = useState(false);
  const [cooldownUntil, setCooldownUntil] = useState<number | null>(null);
  const router = useRouter();

  // If already authenticated (jwt cookie present), skip gate and go to hub
  useEffect(() => {
    let isMounted = true;

    const checkAuth = async () => {
      try {
        const { authenticated, userId: userIdFromServer } = await checkAuthStatus();

        if (authenticated) {
          if (userIdFromServer) {
            saveUserId(userIdFromServer);
          }

          if (isMounted) {
            router.replace("/hub");
          }
        }
      } catch {
        // Unauthenticated: stay on gate
      }
    };

    checkAuth();

    return () => {
      isMounted = false;
    };
  }, [router]);

  const [now, setNow] = useState(Date.now());

  // Auto-clear error state after shake animation
  useEffect(() => {
    if (!error) return;
    const timer = setTimeout(() => setError(false), 500);
    return () => clearTimeout(timer);
  }, [error]);

  useEffect(() => {
    if (!cooldownUntil) return;

    // Update 'now' every second to trigger re-render for countdown
    const interval = setInterval(() => {
      const current = Date.now();
      setNow(current);

      if (current >= cooldownUntil) {
        setCooldownUntil(null);
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [cooldownUntil]);

  const cooldownSecondsLeft = cooldownUntil
    ? Math.max(0, Math.ceil((cooldownUntil - now) / 1000))
    : 0;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!code.trim() || cooldownUntil) return;

    setLoading(true);
    setError(false);

    try {
      // Get existing userId if available
      const existingUserId = getUserId();

      const { valid, userId } = await validateGateCode({
        code,
        userId: existingUserId ?? undefined,
      });

      if (valid) {
        // Success! Store userId only (JWT is in HttpOnly cookie)
        saveUserId(userId);
        router.push("/hub");
      }
    } catch (err: unknown) {
      console.error(err);
      setError(true);

      // Handle rate limit / backoff
      if (err && typeof err === "object" && "response" in err) {
        const axiosErr = err as { response?: { status?: number; data?: { code?: string; retryAfter?: number } } };
        if (
          axiosErr.response?.status === 429 &&
          axiosErr.response?.data?.code === "GATE_BACKOFF"
        ) {
          const retryAfter = axiosErr.response.data.retryAfter;
          if (retryAfter) {
            setCooldownUntil(Date.now() + retryAfter * 1000);
          }
        }
      }

      // Error state triggers shake animation, auto-cleared by useEffect
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen flex-col items-center justify-center p-4 overflow-hidden relative">
      {/* Background Ambient Glow */}
      <div className="absolute top-0 left-0 w-full h-full overflow-hidden -z-10 pointer-events-none">
        <div className="absolute top-[-20%] left-[-10%] w-[50%] h-[50%] bg-purple-900/20 rounded-full blur-[120px]" />
        <div className="absolute bottom-[-20%] right-[-10%] w-[50%] h-[50%] bg-blue-900/20 rounded-full blur-[120px]" />
      </div>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.8, ease: "easeOut" }}
        className="w-full max-w-md flex flex-col items-center gap-8"
      >
        {/* Title */}
        <h1 className="text-4xl md:text-6xl font-bold tracking-tighter text-transparent bg-clip-text bg-gradient-to-r from-slate-200 to-slate-500">
          GATE
        </h1>

        {/* Input Form */}
        <form onSubmit={handleSubmit} className="w-full relative">
          <motion.div
            animate={error ? { x: [-10, 10, -10, 10, 0] } : {}}
            transition={{ type: "tween", duration: 0.4 }}
            className="relative"
          >
            <input
              type="password"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              className={twMerge(
                "w-full bg-slate-800/50 border border-slate-700 text-center text-3xl tracking-widest py-4 px-6 rounded-2xl outline-none transition-all duration-300",
                "focus:border-slate-500 focus:bg-slate-800/80 focus:shadow-[0_0_30px_-5px_rgba(255,255,255,0.1)]",
                error && "border-red-500/50 text-red-200",
                cooldownUntil && "opacity-60 cursor-not-allowed"
              )}
              autoFocus
              disabled={!!cooldownUntil}
            />
            {!code && (
              <span className="absolute inset-0 flex items-center justify-center text-slate-600 text-sm tracking-normal pointer-events-none select-none">
                ENTER ACCESS CODE
              </span>
            )}
          </motion.div>

          {/* Loading / Submit Indicator */}
          <AnimatePresence>
            {loading && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="absolute right-4 top-1/2 -translate-y-1/2"
              >
                <div className="w-5 h-5 border-2 border-slate-500 border-t-transparent rounded-full animate-spin" />
              </motion.div>
            )}
          </AnimatePresence>
        </form>

        {/* Hint / Footer */}
        {/* Footer / Status Message */}
        <div className="flex justify-center w-full h-14 items-start">
          <AnimatePresence mode="wait">
            {cooldownUntil ? (
              <motion.div
                key="cooldown"
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.9 }}
                className="flex items-center gap-3 px-4 py-2 bg-red-500/10 border border-red-500/20 rounded-full text-red-200"
              >
                <div className="w-2 h-2 rounded-full bg-red-400 animate-pulse" />
                <span className="text-sm font-medium tracking-wide">
                  잠시 후 다시 시도하세요{" "}
                  <span className="font-mono ml-1">{cooldownSecondsLeft}s</span>
                </span>
              </motion.div>
            ) : (
              <motion.p
                key="welcome"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ delay: 0.5, duration: 1 }}
                className="text-xs text-slate-600 uppercase tracking-[0.2em]"
              >
                AD ASTRA PER ASPERA
              </motion.p>
            )}
          </AnimatePresence>
        </div>
      </motion.div>
    </div>
  );
}
