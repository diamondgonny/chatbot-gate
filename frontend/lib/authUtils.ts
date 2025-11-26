// Authentication utility functions for managing userId

/**
 * Save userId to localStorage
 */
export const saveUserId = (userId: string): void => {
  if (typeof window !== 'undefined') {
    localStorage.setItem('userId', userId);
  }
};

/**
 * Get userId from localStorage
 */
export const getUserId = (): string | null => {
  if (typeof window !== 'undefined') {
    return localStorage.getItem('userId');
  }
  return null;
};

/**
 * Clear authentication data (logout)
 */
export const clearAuth = (): void => {
  if (typeof window !== 'undefined') {
    localStorage.removeItem('userId');
  }
};

/**
 * Check if user is authenticated
 */
export const isAuthenticated = (): boolean => {
  return !!getUserId();
};
