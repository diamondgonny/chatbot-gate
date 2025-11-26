// Authentication utility functions for managing userId

/**
 * Save userId to localStorage
 */
export const saveUserId = (userId: string): void => {
  localStorage.setItem('userId', userId);
};

/**
 * Get userId from localStorage
 */
export const getUserId = (): string | null => {
  return localStorage.getItem('userId');
};

/**
 * Clear authentication data (logout)
 */
export const clearAuth = (): void => {
  localStorage.removeItem('userId');
};

/**
 * Check if user is authenticated
 */
export const isAuthenticated = (): boolean => {
  return !!getUserId();
};
