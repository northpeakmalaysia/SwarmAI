import { useState, useEffect } from 'react';

/**
 * Custom hook for responsive media queries
 * @param query - CSS media query string (e.g., '(max-width: 639px)')
 * @returns boolean indicating if the query matches
 */
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(() => {
    // Check if window is defined (for SSR compatibility)
    if (typeof window === 'undefined') return false;
    return window.matchMedia(query).matches;
  });

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const mediaQuery = window.matchMedia(query);
    setMatches(mediaQuery.matches);

    const handler = (event: MediaQueryListEvent) => {
      setMatches(event.matches);
    };

    mediaQuery.addEventListener('change', handler);
    return () => mediaQuery.removeEventListener('change', handler);
  }, [query]);

  return matches;
}

/**
 * Returns true when viewport is mobile size (< 640px)
 * Tailwind's sm breakpoint starts at 640px
 */
export function useIsMobile(): boolean {
  return useMediaQuery('(max-width: 639px)');
}

/**
 * Returns true when viewport is tablet size (640px - 1023px)
 * Between Tailwind's sm and lg breakpoints
 */
export function useIsTablet(): boolean {
  return useMediaQuery('(min-width: 640px) and (max-width: 1023px)');
}

/**
 * Returns true when viewport is desktop size (>= 1024px)
 * Tailwind's lg breakpoint and above
 */
export function useIsDesktop(): boolean {
  return useMediaQuery('(min-width: 1024px)');
}

/**
 * Returns true when viewport is smaller than desktop (< 1024px)
 * Useful for showing mobile/tablet specific UI
 */
export function useIsMobileOrTablet(): boolean {
  return useMediaQuery('(max-width: 1023px)');
}

/**
 * Returns the current breakpoint name
 * Useful for debugging and conditional rendering
 */
export function useBreakpoint(): 'mobile' | 'tablet' | 'desktop' {
  const isMobile = useIsMobile();
  const isTablet = useIsTablet();

  if (isMobile) return 'mobile';
  if (isTablet) return 'tablet';
  return 'desktop';
}
