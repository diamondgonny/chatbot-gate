"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { isAuthenticated } from "@/lib/authUtils";

/**
 * Higher-Order Component for protecting routes
 * Redirects to gate (landing) page if user is not authenticated
 */
export function withAuth<P extends object>(
  WrappedComponent: React.ComponentType<P>
) {
  return function ProtectedRoute(props: P) {
    const router = useRouter();

    useEffect(() => {
      // Check authentication on mount
      if (!isAuthenticated()) {
        router.push("/");
      }
    }, [router]);

    // If not authenticated, don't render the component
    if (!isAuthenticated()) {
      return null;
    }

    return <WrappedComponent {...props} />;
  };
}
