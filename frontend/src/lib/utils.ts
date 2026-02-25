import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

/**
 * Utility function to merge Tailwind CSS classes with clsx
 * Handles class conflicts intelligently (e.g., 'bg-red-500 bg-blue-500' -> 'bg-blue-500')
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Extract error message from various error types
 * Handles: Error instances, API error objects, strings, and unknown types
 *
 * This is critical for preventing React Error #300 ("Objects are not valid as a React child")
 * which occurs when an object is accidentally rendered in JSX.
 *
 * The axios interceptor in api.ts transforms errors to ApiError objects { error: string, message?: string }
 * This function safely extracts a string message from any error type.
 */
export function extractErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error) {
    return error.message;
  }
  if (typeof error === 'string') {
    return error;
  }
  if (error && typeof error === 'object') {
    // Handle ApiError-like objects { error: string, message?: string }
    const apiError = error as { error?: unknown; message?: unknown };
    if (typeof apiError.message === 'string') {
      return apiError.message;
    }
    if (typeof apiError.error === 'string') {
      return apiError.error;
    }
  }
  return fallback;
}
