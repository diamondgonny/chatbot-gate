```
"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { isAuthenticated } from "@/lib/authUtils";

/**
 * Higher-Order Component for protecting routes
 * Redirects unauthenticated users to the gate page
 */
export function withAuth<P extends object>(
  Component: React.ComponentType<P>
) {
  return function ProtectedRoute(props: P) {
    const router = useRouter();
    const [isChecking, setIsChecking] = useState(true);

    useEffect(() => {
      // Check authentication only on client side
      if (!isAuthenticated()) {
        router.push("/");
      } else {
        setIsChecking(false);
      }
    }, [router]);

    // Show loading state during auth check to prevent hydration mismatch
    if (isChecking) {
      return (
        <div className="flex items-center justify-center h-screen bg-slate-900">
          <div className="text-slate-400">Loading...</div>
        </div>
      );
    }

    return <Component {...props} />;
  };
}
