import { useCallback, useRef, useEffect } from 'react';

/**
 * Color palette for sender differentiation in group chats
 * 12 distinct colors that are visible on dark backgrounds
 */
export const SENDER_COLORS = [
  { name: 'rose', border: 'border-l-rose-400', text: 'text-rose-400', bg: 'bg-rose-400' },
  { name: 'emerald', border: 'border-l-emerald-400', text: 'text-emerald-400', bg: 'bg-emerald-400' },
  { name: 'amber', border: 'border-l-amber-400', text: 'text-amber-400', bg: 'bg-amber-400' },
  { name: 'cyan', border: 'border-l-cyan-400', text: 'text-cyan-400', bg: 'bg-cyan-400' },
  { name: 'purple', border: 'border-l-purple-400', text: 'text-purple-400', bg: 'bg-purple-400' },
  { name: 'pink', border: 'border-l-pink-400', text: 'text-pink-400', bg: 'bg-pink-400' },
  { name: 'lime', border: 'border-l-lime-400', text: 'text-lime-400', bg: 'bg-lime-400' },
  { name: 'orange', border: 'border-l-orange-400', text: 'text-orange-400', bg: 'bg-orange-400' },
  { name: 'teal', border: 'border-l-teal-400', text: 'text-teal-400', bg: 'bg-teal-400' },
  { name: 'indigo', border: 'border-l-indigo-400', text: 'text-indigo-400', bg: 'bg-indigo-400' },
  { name: 'sky', border: 'border-l-sky-400', text: 'text-sky-400', bg: 'bg-sky-400' },
  { name: 'fuchsia', border: 'border-l-fuchsia-400', text: 'text-fuchsia-400', bg: 'bg-fuchsia-400' },
] as const;

export type SenderColor = typeof SENDER_COLORS[number];

/**
 * Hash a sender ID to a consistent color index using djb2 algorithm
 * This ensures the same sender always gets the same color
 */
function hashSenderId(senderId: string): number {
  let hash = 5381;
  for (let i = 0; i < senderId.length; i++) {
    hash = ((hash << 5) + hash) + senderId.charCodeAt(i);
    hash = hash & hash; // Convert to 32-bit integer
  }
  return Math.abs(hash) % SENDER_COLORS.length;
}

/**
 * Hook to get deterministic colors for message senders
 * Colors are cached per conversation to ensure consistency
 *
 * @param conversationId - The conversation ID to scope the color cache
 * @returns getSenderColor function that returns a color for a given sender ID
 */
export function useSenderColors(conversationId: string) {
  const colorCache = useRef<Map<string, SenderColor>>(new Map());

  // Clear cache when conversation changes
  useEffect(() => {
    colorCache.current.clear();
  }, [conversationId]);

  const getSenderColor = useCallback((senderId: string): SenderColor => {
    // Return cached color if available
    const cached = colorCache.current.get(senderId);
    if (cached) {
      return cached;
    }

    // Calculate color index from sender ID hash
    const index = hashSenderId(senderId);
    const color = SENDER_COLORS[index];

    // Cache for future use
    colorCache.current.set(senderId, color);

    return color;
  }, []);

  return { getSenderColor, colors: SENDER_COLORS };
}

/**
 * Get sender color without hook (for use outside React components)
 * Note: This doesn't cache per conversation
 */
export function getSenderColorStatic(senderId: string): SenderColor {
  const index = hashSenderId(senderId);
  return SENDER_COLORS[index];
}
