/**
 * Navigation abstraction for testability.
 * Abstracts window.location operations to enable contract-based testing.
 */
export const navigation = {
  /**
   * Navigate to the gate page.
   * Used when authentication fails (401/403).
   */
  goToGate: () => {
    if (typeof window !== "undefined") {
      window.location.href = "/";
    }
  },
};
