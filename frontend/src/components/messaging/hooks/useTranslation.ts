import { useState, useCallback } from 'react';
import type { Platform } from '../../../types';

/**
 * Translation cache entry
 */
interface TranslationCacheEntry {
  translatedText: string;
  targetLanguage: string;
  provider: string;
  timestamp: number;
}

/**
 * Translation result
 */
export interface TranslationResult {
  success: boolean;
  translatedText?: string;
  provider?: string;
  error?: string;
}

// In-memory translation cache (persists during session)
const translationCache: Map<string, TranslationCacheEntry> = new Map();

// Cache TTL: 24 hours
const CACHE_TTL = 24 * 60 * 60 * 1000;

/**
 * Generate cache key for a translation
 */
function getCacheKey(messageId: string, targetLanguage: string): string {
  return `${messageId}:${targetLanguage}`;
}

/**
 * Hook for translating messages with caching
 *
 * @param defaultTargetLanguage - Default language to translate to
 * @returns Translation functions and state
 */
export function useTranslation(defaultTargetLanguage: string = 'en') {
  const [translatingIds, setTranslatingIds] = useState<Set<string>>(new Set());

  /**
   * Translate a message
   */
  const translateMessage = useCallback(async (
    messageId: string,
    messageText: string,
    platform: Platform,
    targetLanguage?: string
  ): Promise<TranslationResult> => {
    const targetLang = targetLanguage || defaultTargetLanguage;
    const cacheKey = getCacheKey(messageId, targetLang);

    // Check cache first
    const cached = translationCache.get(cacheKey);
    if (cached) {
      const age = Date.now() - cached.timestamp;
      if (age < CACHE_TTL) {
        return {
          success: true,
          translatedText: cached.translatedText,
          provider: cached.provider,
        };
      }
      // Cache expired, remove it
      translationCache.delete(cacheKey);
    }

    // Mark as translating
    setTranslatingIds(prev => new Set(prev).add(messageId));

    try {
      const token = localStorage.getItem('token');
      const response = await fetch('/api/ai/translate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token && { Authorization: `Bearer ${token}` }),
        },
        body: JSON.stringify({
          message: messageText,
          targetLanguage: targetLang,
          platform,
        }),
      });

      const data = await response.json();

      if (response.ok && data.success && data.translatedMessage) {
        // Cache the result
        translationCache.set(cacheKey, {
          translatedText: data.translatedMessage,
          targetLanguage: targetLang,
          provider: data.provider || 'superbrain',
          timestamp: Date.now(),
        });

        return {
          success: true,
          translatedText: data.translatedMessage,
          provider: data.provider,
        };
      }

      return {
        success: false,
        error: data.error || 'Translation failed',
      };
    } catch (error) {
      console.error('Translation error:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Translation failed',
      };
    } finally {
      setTranslatingIds(prev => {
        const next = new Set(prev);
        next.delete(messageId);
        return next;
      });
    }
  }, [defaultTargetLanguage]);

  /**
   * Check if a message is currently being translated
   */
  const isTranslating = useCallback((messageId: string): boolean => {
    return translatingIds.has(messageId);
  }, [translatingIds]);

  /**
   * Get cached translation for a message
   */
  const getCachedTranslation = useCallback((
    messageId: string,
    targetLanguage?: string
  ): TranslationCacheEntry | null => {
    const targetLang = targetLanguage || defaultTargetLanguage;
    const cacheKey = getCacheKey(messageId, targetLang);
    const cached = translationCache.get(cacheKey);

    if (cached) {
      const age = Date.now() - cached.timestamp;
      if (age < CACHE_TTL) {
        return cached;
      }
      // Cache expired
      translationCache.delete(cacheKey);
    }

    return null;
  }, [defaultTargetLanguage]);

  /**
   * Clear translation cache for a specific message or all
   */
  const clearCache = useCallback((messageId?: string) => {
    if (messageId) {
      // Clear all cached translations for this message (all languages)
      for (const key of translationCache.keys()) {
        if (key.startsWith(`${messageId}:`)) {
          translationCache.delete(key);
        }
      }
    } else {
      // Clear all
      translationCache.clear();
    }
  }, []);

  return {
    translateMessage,
    isTranslating,
    getCachedTranslation,
    clearCache,
  };
}

/**
 * Supported languages for translation
 */
export const SUPPORTED_LANGUAGES = [
  { code: 'en', name: 'English' },
  { code: 'es', name: 'Spanish' },
  { code: 'fr', name: 'French' },
  { code: 'de', name: 'German' },
  { code: 'it', name: 'Italian' },
  { code: 'pt', name: 'Portuguese' },
  { code: 'ru', name: 'Russian' },
  { code: 'zh', name: 'Chinese' },
  { code: 'ja', name: 'Japanese' },
  { code: 'ko', name: 'Korean' },
  { code: 'ar', name: 'Arabic' },
  { code: 'hi', name: 'Hindi' },
  { code: 'id', name: 'Indonesian' },
  { code: 'ms', name: 'Malay' },
  { code: 'th', name: 'Thai' },
  { code: 'vi', name: 'Vietnamese' },
  { code: 'nl', name: 'Dutch' },
  { code: 'pl', name: 'Polish' },
  { code: 'tr', name: 'Turkish' },
  { code: 'uk', name: 'Ukrainian' },
] as const;

export type SupportedLanguageCode = typeof SUPPORTED_LANGUAGES[number]['code'];
