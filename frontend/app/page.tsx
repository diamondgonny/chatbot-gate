import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import axios from "axios";
import { useRouter } from "next/navigation";
import { clsx } from "clsx";
import { twMerge } from "tailwind-merge";
import { saveAuth } from "@/lib/authUtils";

export default function Gate() {
  const [code, setCode] = useState("");
  const [error, setError] = useState(false);
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!code.trim()) return;

    setLoading(true);
    setError(false);

    try {
      // Call the backend API
      // Note: In a real prod app, use an env var for the API URL
      const response = await axios.post(
        "http://localhost:4000/api/gate/validate",
        { code }
      );

      if (response.data.valid) {
        // Success! Store sessionId and JWT token
        const { sessionId, token } = response.data;
        saveAuth(sessionId, token);

        // Redirect to hub
        router.push("/hub");
      }
    } catch (err) {
      console.error(err);
      setError(true);
      // Shake animation trigger
      setTimeout(() => setError(false), 500);
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
          >
            <input
              type="text"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder="ENTER ACCESS CODE"
              className={twMerge(
                "w-full bg-slate-800/50 border border-slate-700 text-center text-xl tracking-widest py-4 px-6 rounded-2xl outline-none transition-all duration-300",
                "focus:border-slate-500 focus:bg-slate-800/80 focus:shadow-[0_0_30px_-5px_rgba(255,255,255,0.1)]",
                "placeholder:text-slate-600 placeholder:text-sm placeholder:tracking-normal",
                error && "border-red-500/50 text-red-200"
              )}
              autoFocus
            />
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
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 1, duration: 1 }}
          className="text-xs text-slate-600 uppercase tracking-[0.2em]"
        >
          Restricted Area
        </motion.p>
      </motion.div>
    </div>
  );
}
