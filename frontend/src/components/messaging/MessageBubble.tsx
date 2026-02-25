import React, { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import {
  Check,
  CheckCheck,
  Clock,
  AlertCircle,
  Reply,
  Copy,
  Trash2,
  MoreVertical,
  Play,
  Pause,
  Download,
  MapPin,
  FileText,
  User,
  Languages,
  Loader2,
  ChevronDown,
  ChevronUp,
  ScanText,
  BookOpen,
  Phone,
  Ban,
  Eye,
  Paperclip,
} from 'lucide-react';
import { cn } from '../../lib/utils';
import { api } from '../../services/api';
import { formatTime } from '../../utils/dateFormat';
import type { Message, MessageContent, MessageReaction, Platform } from '../../types';

// Cache for link previews to avoid refetching
const linkPreviewCache = new Map<string, { title?: string; description?: string; image?: string; siteName?: string; favicon?: string } | null>();

// Track pending requests to prevent duplicate fetches for same URL
const pendingLinkPreviewRequests = new Map<string, Promise<any>>();

export interface MessageBubbleProps {
  /** The message to display */
  message: Message;
  /** Whether this is the current user's message */
  isOwn: boolean;
  /** Whether to show the avatar */
  showAvatar?: boolean;
  /** Whether this is a group conversation */
  isGroup?: boolean;
  /** Sender color for group messages (border and name badge) */
  senderColor?: {
    border: string;
    text: string;
    bg: string;
  };
  /** Callback when reply is clicked */
  onReply?: () => void;
  /** Callback when reaction is added */
  onReact?: (emoji: string) => void;
  /** Callback when copy is clicked */
  onCopy?: () => void;
  /** Callback when delete is clicked */
  onDelete?: () => void;
  /** Callback when media is clicked (for preview) */
  onMediaClick?: (url: string, type: 'image' | 'video') => void;
  /** Target language for translation (default from user settings) */
  translationLanguage?: string;
  /** Auth token for API calls */
  authToken?: string;
  /** Additional class names */
  className?: string;
}

/**
 * Get platform color class
 */
const getPlatformColor = (platform: Platform): string => {
  switch (platform) {
    case 'whatsapp':
      return 'text-emerald-400';
    case 'telegram-bot':
    case 'telegram-user':
      return 'text-sky-400';
    case 'email':
      return 'text-rose-400';
    default:
      return 'text-gray-400';
  }
};

/**
 * Message status icon component
 */
const MessageStatus: React.FC<{ status?: Message['status'] }> = ({ status }) => {
  switch (status) {
    case 'pending':
      return <Clock className="w-3 h-3 text-sky-300" />;
    case 'sent':
      return <Check className="w-3 h-3 text-sky-300" />;
    case 'delivered':
      return <CheckCheck className="w-3 h-3 text-sky-300" />;
    case 'read':
      return <CheckCheck className="w-3 h-3 text-sky-400" />;
    case 'failed':
      return <AlertCircle className="w-3 h-3 text-red-400" />;
    default:
      return null;
  }
};

/**
 * Reactions display component
 */
const ReactionsDisplay: React.FC<{ reactions?: MessageReaction[] }> = ({ reactions }) => {
  if (!reactions || reactions.length === 0) return null;

  // Group reactions by emoji
  const grouped = reactions.reduce(
    (acc, reaction) => {
      if (!reaction.isRemoval) {
        acc[reaction.emoji] = (acc[reaction.emoji] || 0) + 1;
      }
      return acc;
    },
    {} as Record<string, number>
  );

  if (Object.keys(grouped).length === 0) return null;

  return (
    <div className="flex items-center gap-1 mt-1">
      {Object.entries(grouped).map(([emoji, count]) => (
        <span
          key={emoji}
          className="inline-flex items-center gap-0.5 px-1.5 py-0.5 bg-slate-600/50 rounded-full text-xs"
        >
          <span>{emoji}</span>
          {count > 1 && <span className="text-gray-400">{count}</span>}
        </span>
      ))}
    </div>
  );
};

/**
 * Reply preview component
 */
const ReplyPreview: React.FC<{ replyToId?: string }> = ({ replyToId }) => {
  if (!replyToId) return null;

  // In a real implementation, we would fetch the original message
  return (
    <div className="mb-2 p-2 bg-black/20 rounded border-l-2 border-sky-500">
      <p className="text-xs text-gray-400 truncate">Replying to a message...</p>
    </div>
  );
};

/**
 * URL pattern matchers
 */
const URL_REGEX = /(https?:\/\/[^\s<]+)/gi;
const YOUTUBE_REGEX = /(?:youtube\.com\/(?:watch\?v=|embed\/|shorts\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})/;
const TIKTOK_REGEX = /tiktok\.com\/@[^/]+\/video\/(\d+)|tiktok\.com\/t\/([a-zA-Z0-9]+)/;
const IMAGE_REGEX = /\.(jpg|jpeg|png|gif|webp|svg)(\?.*)?$/i;

/**
 * HTML email detection pattern
 * Matches content that starts with HTML doctype or common HTML tags
 */
const HTML_EMAIL_REGEX = /^\s*(<\!DOCTYPE|<html|<head|<body|<table|<div|<p\s|<span)/i;

/**
 * Check if text content is HTML (for email rendering)
 */
const isHtmlContent = (text: string): boolean => {
  return HTML_EMAIL_REGEX.test(text.trim());
};

/**
 * Extract YouTube video ID from URL
 */
const getYouTubeId = (url: string): string | null => {
  const match = url.match(YOUTUBE_REGEX);
  return match ? match[1] : null;
};

/**
 * Check if URL is a TikTok video
 */
const isTikTokUrl = (url: string): boolean => {
  return TIKTOK_REGEX.test(url);
};

/**
 * Check if URL is an image
 */
const isImageUrl = (url: string): boolean => {
  return IMAGE_REGEX.test(url);
};

/**
 * YouTube embed component
 */
const YouTubeEmbed: React.FC<{ videoId: string }> = ({ videoId }) => (
  <div className="mt-2 rounded overflow-hidden aspect-video max-w-md">
    <iframe
      src={`https://www.youtube.com/embed/${videoId}`}
      title="YouTube video"
      allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
      allowFullScreen
      className="w-full h-full"
    />
  </div>
);

/**
 * TikTok embed component (shows link preview since TikTok embeds require scripts)
 */
const TikTokEmbed: React.FC<{ url: string }> = ({ url }) => (
  <a
    href={url}
    target="_blank"
    rel="noopener noreferrer"
    title="Open TikTok video"
    className="mt-2 flex items-center gap-3 p-3 bg-black/20 rounded hover:bg-black/30 transition-colors max-w-md"
  >
    <div className="w-10 h-10 flex items-center justify-center bg-black rounded flex-shrink-0">
      <svg className="w-6 h-6 text-white" viewBox="0 0 24 24" fill="currentColor">
        <path d="M19.59 6.69a4.83 4.83 0 01-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 01-5.2 1.74 2.89 2.89 0 012.31-4.64 2.93 2.93 0 01.88.13V9.4a6.84 6.84 0 00-1-.05A6.33 6.33 0 005 20.1a6.34 6.34 0 0010.86-4.43v-7a8.16 8.16 0 004.77 1.52v-3.4a4.85 4.85 0 01-1-.1z"/>
      </svg>
    </div>
    <div className="flex-1 min-w-0">
      <p className="text-sm font-medium text-white">TikTok Video</p>
      <p className="text-xs text-gray-400 truncate">{url}</p>
    </div>
  </a>
);

/**
 * Image preview component
 */
const ImageEmbed: React.FC<{ url: string; onClick?: () => void }> = ({ url, onClick }) => (
  <div className="mt-2">
    <img
      src={url}
      alt="Shared image"
      className="rounded max-w-full max-h-64 object-cover cursor-pointer hover:opacity-90 transition-opacity"
      onClick={onClick}
      onError={(e) => {
        // Hide broken images
        (e.target as HTMLImageElement).style.display = 'none';
      }}
    />
  </div>
);

/**
 * Generic link preview component (simple clickable link)
 */
const LinkPreview: React.FC<{ url: string }> = ({ url }) => {
  // Extract domain for display
  let domain = '';
  try {
    domain = new URL(url).hostname.replace('www.', '');
  } catch {
    domain = url;
  }

  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className="text-sky-400 hover:underline break-all"
    >
      {url.length > 50 ? `${url.substring(0, 50)}...` : url}
    </a>
  );
};

/**
 * Email attachment type
 */
interface EmailAttachment {
  filename: string;
  contentType?: string;
  size?: number;
  url?: string;
}

/**
 * HTML Email content renderer
 * Renders HTML content safely in a sandboxed iframe
 */
const HtmlEmailContent: React.FC<{
  html: string;
  attachments?: EmailAttachment[];
  subject?: string;
}> = ({ html, attachments, subject }) => {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [iframeHeight, setIframeHeight] = useState(300);
  const [isExpanded, setIsExpanded] = useState(false);

  useEffect(() => {
    const iframe = iframeRef.current;
    if (!iframe) return;

    // Wait for iframe to load
    const handleLoad = () => {
      try {
        const doc = iframe.contentDocument || iframe.contentWindow?.document;
        if (doc) {
          // Inject styles for dark mode compatibility and proper rendering
          const style = doc.createElement('style');
          style.textContent = `
            body {
              margin: 0;
              padding: 12px;
              font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
              font-size: 14px;
              line-height: 1.5;
              color: #e2e8f0;
              background: transparent;
              overflow-x: auto;
            }
            a { color: #38bdf8; }
            img { max-width: 100%; height: auto; }
            table { max-width: 100%; }
            * { box-sizing: border-box; }
          `;
          doc.head.appendChild(style);

          // Calculate content height
          const contentHeight = doc.body.scrollHeight;
          setIframeHeight(Math.min(contentHeight + 24, isExpanded ? 2000 : 400));
        }
      } catch (e) {
        // Cross-origin restrictions, use default height
        console.warn('Could not access iframe content:', e);
      }
    };

    iframe.addEventListener('load', handleLoad);
    return () => iframe.removeEventListener('load', handleLoad);
  }, [html, isExpanded]);

  // Create a blob URL for the HTML content
  const htmlBlob = useMemo(() => {
    const wrappedHtml = `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1">
          <base target="_blank">
        </head>
        <body>${html}</body>
      </html>
    `;
    const blob = new Blob([wrappedHtml], { type: 'text/html' });
    return URL.createObjectURL(blob);
  }, [html]);

  // Cleanup blob URL
  useEffect(() => {
    return () => URL.revokeObjectURL(htmlBlob);
  }, [htmlBlob]);

  return (
    <div className="relative">
      <div
        className={cn(
          'rounded-lg overflow-hidden border border-white/10 bg-slate-800/50',
          !isExpanded && iframeHeight >= 400 && 'max-h-[400px]'
        )}
      >
        <iframe
          ref={iframeRef}
          src={htmlBlob}
          sandbox="allow-same-origin"
          className="w-full border-0"
          style={{
            height: `${iframeHeight}px`,
            background: 'transparent',
            colorScheme: 'dark'
          }}
          title="Email content"
        />
        {/* Gradient overlay when collapsed */}
        {!isExpanded && iframeHeight >= 400 && (
          <div className="absolute bottom-0 left-0 right-0 h-16 bg-gradient-to-t from-slate-800 to-transparent pointer-events-none" />
        )}
      </div>
      {/* Expand/Collapse button */}
      {iframeHeight >= 400 && (
        <button
          type="button"
          onClick={() => setIsExpanded(!isExpanded)}
          className="mt-2 text-xs text-sky-400 hover:text-sky-300 flex items-center gap-1"
        >
          {isExpanded ? (
            <>
              <ChevronUp className="w-3 h-3" />
              Show less
            </>
          ) : (
            <>
              <ChevronDown className="w-3 h-3" />
              Show more
            </>
          )}
        </button>
      )}

      {/* Email attachments */}
      {attachments && attachments.length > 0 && (
        <div className="mt-3 pt-3 border-t border-white/10">
          <div className="flex items-center gap-2 text-xs text-gray-400 mb-2">
            <Paperclip className="w-3.5 h-3.5" />
            <span>{attachments.length} attachment{attachments.length !== 1 ? 's' : ''}</span>
          </div>
          <div className="flex flex-wrap gap-2">
            {attachments.map((attachment, index) => {
              const formatSize = (bytes?: number) => {
                if (!bytes) return '';
                if (bytes < 1024) return `${bytes} B`;
                if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
                return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
              };

              // Determine icon based on content type
              const getIcon = () => {
                const type = attachment.contentType || '';
                if (type.includes('pdf')) return 'PDF';
                if (type.includes('word') || type.includes('document')) return 'DOC';
                if (type.includes('sheet') || type.includes('excel')) return 'XLS';
                if (type.includes('image')) return 'IMG';
                return 'FILE';
              };

              return (
                <div
                  key={index}
                  className="flex items-center gap-2 px-3 py-2 bg-slate-700/50 hover:bg-slate-700 rounded-lg transition-colors cursor-pointer"
                  title={attachment.filename}
                >
                  <div className="w-8 h-8 flex items-center justify-center bg-sky-500/20 rounded text-[10px] font-bold text-sky-400">
                    {getIcon()}
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs text-gray-200 truncate max-w-[150px]">{attachment.filename}</p>
                    {attachment.size && (
                      <p className="text-[10px] text-gray-500">{formatSize(attachment.size)}</p>
                    )}
                  </div>
                  {attachment.url && (
                    <a
                      href={attachment.url}
                      download={attachment.filename}
                      className="p-1 hover:bg-white/10 rounded transition-colors"
                      onClick={(e) => e.stopPropagation()}
                      title={`Download ${attachment.filename}`}
                      aria-label={`Download ${attachment.filename}`}
                    >
                      <Download className="w-3.5 h-3.5 text-gray-400" />
                    </a>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};

/**
 * Rich link preview card with OG metadata
 * Can use pre-existing data from WhatsApp/Telegram or fetch from API
 */
const RichLinkPreview: React.FC<{
  url: string;
  storedData?: StoredLinkPreview | null;
}> = ({ url, storedData }) => {
  const [preview, setPreview] = useState<{
    title?: string;
    description?: string;
    image?: string;
    siteName?: string;
    favicon?: string;
  } | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Extract domain for display
  let domain = '';
  try {
    domain = new URL(url).hostname.replace('www.', '');
  } catch {
    domain = url;
  }

  useEffect(() => {
    let isMounted = true;

    // Use stored data from WhatsApp/Telegram if available
    if (storedData && (storedData.title || storedData.description || storedData.thumbnail)) {
      setPreview({
        title: storedData.title || undefined,
        description: storedData.description || undefined,
        image: storedData.thumbnail || undefined,
        siteName: domain,
      });
      setIsLoading(false);
      return;
    }

    // Check cache first
    if (linkPreviewCache.has(url)) {
      const cached = linkPreviewCache.get(url);
      // Cached value is always valid (either real data or fallback)
      setPreview(cached ?? { title: domain, siteName: domain });
      setIsLoading(false);
      return;
    }

    // Check if there's already a pending request for this URL
    const existingRequest = pendingLinkPreviewRequests.get(url);
    if (existingRequest) {
      // Wait for the existing request instead of making a new one
      existingRequest
        .then((data) => {
          if (isMounted) {
            // Show preview if we have ANY useful content (title, description, OR image)
            if (data?.title || data?.description || data?.image) {
              setPreview(data);
            } else {
              // Fallback: show minimal preview with just domain
              setPreview({ title: domain, siteName: domain });
            }
            setIsLoading(false);
          }
        })
        .catch(() => {
          if (isMounted) {
            // On error, show minimal fallback instead of nothing
            setPreview({ title: domain, siteName: domain });
            setIsLoading(false);
          }
        });
      return;
    }

    // Fetch preview
    const fetchPreview = async () => {
      const request = api.get<{ preview: typeof preview }>(`/ai/link-preview`, {
        params: { url },
      }).then((response) => {
        // API returns { preview: { ... } }
        const data = (response as { preview: typeof preview }).preview;

        // Cache the result - cache any data we get (title, description, OR image)
        if (data?.title || data?.description || data?.image) {
          linkPreviewCache.set(url, data);
        } else {
          // Cache minimal fallback
          linkPreviewCache.set(url, { title: domain, siteName: domain });
        }

        // Clean up pending request
        pendingLinkPreviewRequests.delete(url);

        return data;
      }).catch((error) => {
        // Cache minimal fallback on error
        linkPreviewCache.set(url, { title: domain, siteName: domain });
        pendingLinkPreviewRequests.delete(url);
        throw error;
      });

      // Track this request
      pendingLinkPreviewRequests.set(url, request);

      try {
        const data = await request;

        if (isMounted) {
          // Show preview if we have ANY useful content (title, description, OR image)
          if (data?.title || data?.description || data?.image) {
            setPreview(data);
          } else {
            // Fallback: show minimal preview with just domain
            setPreview({ title: domain, siteName: domain });
          }
        }
      } catch {
        if (isMounted) {
          // On error, show minimal fallback instead of nothing
          setPreview({ title: domain, siteName: domain });
        }
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    };

    fetchPreview();

    // Cleanup function
    return () => {
      isMounted = false;
    };
  }, [url]);

  // Show loading skeleton while fetching (unless we have cached data)
  if (isLoading && !preview) {
    return null;
  }

  // Loading skeleton
  if (isLoading) {
    return (
      <div className="mt-2 rounded overflow-hidden border border-slate-600/50 bg-slate-800/50 animate-pulse">
        <div className="h-32 bg-slate-700/50" />
        <div className="p-3 space-y-2">
          <div className="h-4 bg-slate-700/50 rounded w-3/4" />
          <div className="h-3 bg-slate-700/50 rounded w-full" />
          <div className="h-3 bg-slate-700/50 rounded w-1/2" />
        </div>
      </div>
    );
  }

  if (!preview) return null;

  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className="mt-2 block rounded overflow-hidden border border-slate-600/50 bg-slate-800/50 hover:bg-slate-700/50 transition-colors"
    >
      {/* Image */}
      {preview.image && (
        <div className="relative h-32 w-full bg-slate-700/50">
          <img
            src={preview.image}
            alt={preview.title || 'Link preview'}
            className="w-full h-full object-cover"
            loading="lazy"
            onError={(e) => {
              // Hide broken images
              (e.target as HTMLImageElement).style.display = 'none';
            }}
          />
        </div>
      )}

      {/* Content */}
      <div className="p-3">
        {/* Site name / domain */}
        <div className="flex items-center gap-1 text-xs text-gray-400 mb-1">
          {preview.favicon && (
            <img
              src={preview.favicon}
              alt=""
              className="w-4 h-4"
              onError={(e) => {
                (e.target as HTMLImageElement).style.display = 'none';
              }}
            />
          )}
          <span>{preview.siteName || domain}</span>
        </div>

        {/* Title */}
        {preview.title && (
          <h4 className="font-medium text-sm text-white line-clamp-2 mb-1">
            {preview.title}
          </h4>
        )}

        {/* Description */}
        {preview.description && (
          <p className="text-xs text-gray-400 line-clamp-2">
            {preview.description}
          </p>
        )}
      </div>
    </a>
  );
};

/**
 * Check if URL should have a rich preview (not YouTube or direct image)
 * TikTok URLs now use rich preview to fetch actual OG metadata
 */
const shouldShowRichPreview = (url: string): boolean => {
  // Skip YouTube (has dedicated embed)
  if (getYouTubeId(url)) return false;
  // Skip direct images (rendered inline)
  if (isImageUrl(url)) return false;
  // Show preview for all other URLs including TikTok
  return true;
};

/**
 * Pre-existing link preview data from platform (WhatsApp/Telegram)
 */
interface StoredLinkPreview {
  url?: string;
  title?: string | null;
  description?: string | null;
  thumbnail?: string | null;
  matchedText?: string | null;
  canonicalUrl?: string | null;
}

/**
 * Text content renderer with link detection and embeds
 */
const TextContent: React.FC<{
  text?: string;
  onMediaClick?: (url: string, type: 'image' | 'video') => void;
  storedLinkPreview?: StoredLinkPreview | null;
}> = ({ text, onMediaClick, storedLinkPreview }) => {
  if (!text) return null;

  // Find all URLs in the text
  const urls = text.match(URL_REGEX) || [];

  // If no URLs, just render plain text
  if (urls.length === 0) {
    return <p className="whitespace-pre-wrap break-words">{text}</p>;
  }

  // Split text by URLs and create segments
  const segments: React.ReactNode[] = [];
  let lastIndex = 0;
  const processedUrls: string[] = [];

  // Replace URLs with links in the text
  const textWithLinks = text.replace(URL_REGEX, (url) => {
    processedUrls.push(url);
    return `{{URL_PLACEHOLDER_${processedUrls.length - 1}}}`;
  });

  // Split by placeholders and rebuild with links
  const parts = textWithLinks.split(/({{URL_PLACEHOLDER_\d+}})/);
  parts.forEach((part, index) => {
    const match = part.match(/{{URL_PLACEHOLDER_(\d+)}}/);
    if (match) {
      const urlIndex = parseInt(match[1]);
      const url = processedUrls[urlIndex];
      segments.push(
        <LinkPreview key={`link-${index}`} url={url} />
      );
    } else if (part) {
      segments.push(
        <span key={`text-${index}`}>{part}</span>
      );
    }
  });

  // Render embeds for the first URL of each type
  const embeds: React.ReactNode[] = [];
  const richPreviews: React.ReactNode[] = [];
  let hasYouTube = false;
  let hasTikTok = false;
  let hasImage = false;
  let hasRichPreview = false;

  urls.forEach((url, index) => {
    // YouTube embed (dedicated iframe player)
    const ytId = getYouTubeId(url);
    if (ytId && !hasYouTube) {
      hasYouTube = true;
      embeds.push(<YouTubeEmbed key={`yt-${index}`} videoId={ytId} />);
    }
    // Image embed (rendered inline)
    else if (isImageUrl(url) && !hasImage) {
      hasImage = true;
      embeds.push(
        <ImageEmbed
          key={`img-${index}`}
          url={url}
          onClick={() => onMediaClick?.(url, 'image')}
        />
      );
    }
    // Rich link preview for article/web URLs including TikTok (only first one)
    else if (shouldShowRichPreview(url) && !hasRichPreview) {
      hasRichPreview = true;
      // Pass stored preview data if URL matches
      const matchingStoredPreview = storedLinkPreview?.url === url ||
        storedLinkPreview?.canonicalUrl === url ||
        storedLinkPreview?.matchedText === url
          ? storedLinkPreview
          : undefined;
      richPreviews.push(
        <RichLinkPreview key={`rich-${index}`} url={url} storedData={matchingStoredPreview} />
      );
    }
  });

  return (
    <div>
      <p className="whitespace-pre-wrap break-words">{segments}</p>
      {embeds}
      {richPreviews}
    </div>
  );
};

/**
 * Image content renderer
 */
const ImageContent: React.FC<{
  content: MessageContent;
  onClick?: () => void;
}> = ({ content, onClick }) => {
  const url = content.media?.url || content.media?.localPath;
  if (!url) return null;

  return (
    <div className="mb-2">
      <img
        src={url}
        alt={content.media?.caption || 'Image'}
        className="rounded max-w-full max-h-64 object-cover cursor-pointer hover:opacity-90 transition-opacity"
        onClick={onClick}
      />
      {content.media?.caption && (
        <p className="mt-1 text-sm">{content.media.caption}</p>
      )}
    </div>
  );
};

/**
 * Video content renderer
 */
const VideoContent: React.FC<{
  content: MessageContent;
  onClick?: () => void;
}> = ({ content, onClick }) => {
  const url = content.media?.url || content.media?.localPath;
  if (!url) return null;

  return (
    <div className="mb-2 relative">
      {content.media?.thumbnail ? (
        <div className="relative cursor-pointer" onClick={onClick}>
          <img
            src={content.media.thumbnail}
            alt="Video thumbnail"
            className="rounded max-w-full max-h-64 object-cover"
          />
          <div className="absolute inset-0 flex items-center justify-center bg-black/30 rounded">
            <Play className="w-12 h-12 text-white" />
          </div>
        </div>
      ) : (
        <video
          src={url}
          className="rounded max-w-full max-h-64"
          controls
        />
      )}
      {content.media?.caption && (
        <p className="mt-1 text-sm">{content.media.caption}</p>
      )}
    </div>
  );
};

/**
 * Audio/Voice content renderer
 */
const AudioContent: React.FC<{ content: MessageContent; metadata?: Record<string, unknown> }> = ({ content, metadata }) => {
  const [isPlaying, setIsPlaying] = useState(false);
  const audioRef = useRef<HTMLAudioElement>(null);
  const url = content.media?.url || content.media?.localPath;

  if (!url) return null;

  const togglePlay = () => {
    if (audioRef.current) {
      if (isPlaying) {
        audioRef.current.pause();
      } else {
        audioRef.current.play();
      }
      setIsPlaying(!isPlaying);
    }
  };

  const formatDuration = (seconds?: number) => {
    if (!seconds) return '0:00';
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  // Extract transcription text from content or metadata
  const transcriptionText = content.text?.startsWith('[Voice Transcription]: ')
    ? content.text.replace('[Voice Transcription]: ', '')
    : (metadata?.voiceTranscription && content.text) ? content.text : null;

  return (
    <div>
      <div className="flex items-center gap-3 p-2 bg-black/20 rounded">
        <button
          onClick={togglePlay}
          className="w-10 h-10 flex items-center justify-center bg-sky-500 rounded-full hover:bg-sky-600 transition-colors"
        >
          {isPlaying ? (
            <Pause className="w-5 h-5 text-white" />
          ) : (
            <Play className="w-5 h-5 text-white ml-0.5" />
          )}
        </button>
        <div className="flex-1">
          <div className="h-1 bg-gray-600 rounded-full">
            <div className="h-full w-0 bg-sky-500 rounded-full" />
          </div>
          <span className="text-xs text-gray-400 mt-1">
            {formatDuration(content.media?.duration)}
          </span>
        </div>
        <audio
          ref={audioRef}
          src={url}
          onEnded={() => setIsPlaying(false)}
          className="hidden"
        />
      </div>
      {transcriptionText && (
        <div className="mt-1.5 px-2 py-1.5 bg-gray-800/60 rounded text-sm border border-gray-700/50">
          <div className="flex items-center gap-1 text-xs text-gray-500 mb-0.5">
            <FileText className="w-3 h-3" />
            <span>Transcription</span>
            {metadata?.transcriptionProvider ? (
              <span className="ml-1 text-gray-600">via {String(metadata.transcriptionProvider)}</span>
            ) : null}
          </div>
          <p className="text-gray-300 whitespace-pre-wrap">{transcriptionText}</p>
        </div>
      )}
    </div>
  );
};

/**
 * Get file extension info (icon label, colors) based on filename
 */
const getFileExtInfo = (fileName: string): { ext: string; bg: string; text: string } => {
  const extension = fileName.split('.').pop()?.toLowerCase() || '';
  switch (extension) {
    case 'pdf':
      return { ext: 'PDF', bg: 'bg-red-500/80', text: 'text-white' };
    case 'xls': case 'xlsx': case 'xlsm': case 'csv':
      return { ext: extension.toUpperCase(), bg: 'bg-emerald-600/80', text: 'text-white' };
    case 'doc': case 'docx':
      return { ext: 'DOC', bg: 'bg-blue-500/80', text: 'text-white' };
    case 'ppt': case 'pptx':
      return { ext: 'PPT', bg: 'bg-orange-500/80', text: 'text-white' };
    case 'txt': case 'log': case 'md':
      return { ext: extension.toUpperCase(), bg: 'bg-gray-500/80', text: 'text-white' };
    case 'zip': case 'rar': case '7z': case 'tar': case 'gz':
      return { ext: extension.toUpperCase(), bg: 'bg-yellow-600/80', text: 'text-white' };
    case 'json': case 'xml': case 'yaml': case 'yml':
      return { ext: extension.toUpperCase(), bg: 'bg-purple-500/80', text: 'text-white' };
    case 'js': case 'ts': case 'py': case 'java': case 'cpp': case 'cs': case 'html': case 'css':
      return { ext: extension.toUpperCase(), bg: 'bg-cyan-600/80', text: 'text-white' };
    default:
      return { ext: extension ? extension.toUpperCase() : 'FILE', bg: 'bg-slate-500/80', text: 'text-white' };
  }
};

/**
 * Document content renderer
 * Shows file extension badge, filename, size, download, and optional analysis content
 */
const DocumentContent: React.FC<{
  content: MessageContent;
  analysisText?: string | null;
  metadata?: Record<string, unknown>;
}> = ({ content, analysisText, metadata }) => {
  const [showAnalysis, setShowAnalysis] = useState(true);
  const url = content.media?.url || content.media?.localPath;
  const fileName = content.media?.fileName || (metadata?.fileName as string) || 'Document';
  const fileSize = content.media?.fileSize || (metadata?.fileSize as number);
  const mimeType = content.media?.mimeType || '';

  // Analysis text from auto-extraction (readPdf, readExcel, readDocx) or content.text
  // Filter out cases where content.text is just the filename (not real extracted content)
  const isExtracted = metadata?.analysisType === 'document_extract';
  const rawText = analysisText || content.text || null;
  const docAnalysis = rawText && (isExtracted || (rawText !== fileName && rawText.length > fileName.length + 20))
    ? rawText
    : null;

  const formatSize = (bytes?: number) => {
    if (!bytes) return '';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const extInfo = getFileExtInfo(fileName);

  return (
    <div className="space-y-2">
      {/* Document card */}
      <div className="flex items-center gap-3 p-3 bg-black/20 rounded-lg">
        {/* Extension badge icon */}
        <div className={cn(
          'w-11 h-12 flex flex-col items-center justify-center rounded-md flex-shrink-0 shadow-sm',
          extInfo.bg
        )}>
          <FileText className="w-4 h-4 text-white/80 mb-0.5" />
          <span className={cn('text-[9px] font-bold leading-none', extInfo.text)}>
            {extInfo.ext}
          </span>
        </div>

        {/* File info */}
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium truncate" title={fileName}>{fileName}</p>
          <div className="flex items-center gap-2 text-xs text-gray-400">
            {fileSize ? <span>{formatSize(fileSize)}</span> : null}
            {mimeType && fileSize ? <span>·</span> : null}
            {mimeType ? <span className="truncate">{mimeType}</span> : null}
          </div>
        </div>

        {/* Download button */}
        {url && (
          <a
            href={url}
            download={fileName}
            className="p-2 hover:bg-white/10 rounded-lg transition-colors flex-shrink-0"
            title="Download"
          >
            <Download className="w-4 h-4 text-gray-300" />
          </a>
        )}
      </div>

      {/* Document analysis / extracted content in monospace */}
      {docAnalysis && (
        <div className="border-t border-white/10 pt-2">
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs text-sky-300 font-medium flex items-center gap-1">
              <ScanText className="w-3 h-3" />
              {isExtracted ? 'Extracted Content' : 'Document Content'}
              {metadata?.docPages ? (
                <span className="text-gray-400 font-normal">
                  ({String(metadata.docPages)} {String(metadata?.docType) === 'excel' ? 'sheets' : 'pages'})
                </span>
              ) : null}
              {metadata?.truncated ? (
                <span className="text-amber-400/70 font-normal">(truncated)</span>
              ) : null}
            </span>
            <button
              type="button"
              onClick={() => setShowAnalysis(!showAnalysis)}
              className="text-xs text-gray-400 hover:text-gray-300 flex items-center gap-1"
            >
              {showAnalysis ? (
                <>
                  <ChevronUp className="w-3 h-3" />
                  Hide
                </>
              ) : (
                <>
                  <ChevronDown className="w-3 h-3" />
                  Show
                </>
              )}
            </button>
          </div>
          {showAnalysis && (
            <pre className="font-mono text-xs bg-black/30 rounded-md p-2.5 whitespace-pre-wrap break-words text-white/85 max-h-60 overflow-y-auto leading-relaxed scrollbar-thin scrollbar-thumb-slate-600">
              <code>{docAnalysis}</code>
            </pre>
          )}
        </div>
      )}
    </div>
  );
};

/**
 * Location content renderer
 */
const LocationContent: React.FC<{ content: MessageContent }> = ({ content }) => {
  if (!content.location) return null;

  const { latitude, longitude, name, address } = content.location;
  const mapsUrl = `https://maps.google.com/?q=${latitude},${longitude}`;

  return (
    <a
      href={mapsUrl}
      target="_blank"
      rel="noopener noreferrer"
      className="block p-3 bg-black/20 rounded hover:bg-black/30 transition-colors"
    >
      <div className="flex items-start gap-3">
        <div className="w-10 h-10 flex items-center justify-center bg-red-500/20 rounded">
          <MapPin className="w-5 h-5 text-red-400" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium">{name || 'Location'}</p>
          {address && (
            <p className="text-xs text-gray-400 truncate">{address}</p>
          )}
          <p className="text-xs text-sky-400 mt-1">Open in Maps</p>
        </div>
      </div>
    </a>
  );
};

/**
 * Contact content renderer
 */
const ContactContent: React.FC<{ content: MessageContent }> = ({ content }) => {
  if (!content.contact) return null;

  const { name, phones, emails } = content.contact;

  return (
    <div className="p-3 bg-black/20 rounded">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 flex items-center justify-center bg-sky-500/20 rounded-full">
          <User className="w-5 h-5 text-sky-400" />
        </div>
        <div>
          <p className="font-medium">{name}</p>
          {phones && phones.length > 0 && (
            <p className="text-xs text-gray-400">{phones[0]}</p>
          )}
          {emails && emails.length > 0 && (
            <p className="text-xs text-gray-400">{emails[0]}</p>
          )}
        </div>
      </div>
    </div>
  );
};

/**
 * Message content renderer based on type
 */
const MessageContentRenderer: React.FC<{
  content: MessageContent;
  onMediaClick?: (url: string, type: 'image' | 'video') => void;
  metadata?: Record<string, unknown>;
  platform?: Platform;
}> = ({ content, onMediaClick, metadata, platform }) => {
  switch (content.type) {
    case 'text':
      // Check if this is HTML email content
      // Primary check: email platform with HTML content
      // Fallback: any message that looks like a full HTML document (for robustness)
      if (content.text && isHtmlContent(content.text)) {
        const looksLikeFullHtmlDoc = content.text.trim().toLowerCase().startsWith('<!doctype') ||
          (content.text.includes('<html') && content.text.includes('</html>'));
        if (platform === 'email' || looksLikeFullHtmlDoc) {
          // Extract email attachments from metadata
          const emailAttachments = (metadata?.attachments as EmailAttachment[]) ||
            (metadata?.emailAttachments as EmailAttachment[]) || [];
          const emailSubject = metadata?.emailSubject as string | undefined;
          return (
            <HtmlEmailContent
              html={content.text}
              attachments={emailAttachments}
              subject={emailSubject}
            />
          );
        }
      }
      return (
        <TextContent
          text={content.text}
          onMediaClick={onMediaClick}
          storedLinkPreview={metadata?.linkPreview as StoredLinkPreview | undefined}
        />
      );
    case 'image':
      return (
        <ImageContent
          content={content}
          onClick={() => content.media?.url && onMediaClick?.(content.media.url, 'image')}
        />
      );
    case 'video':
      return (
        <VideoContent
          content={content}
          onClick={() => content.media?.url && onMediaClick?.(content.media.url, 'video')}
        />
      );
    case 'audio':
    case 'voice':
      return <AudioContent content={content} metadata={metadata} />;
    case 'document':
      return <DocumentContent content={content} metadata={metadata} />;
    case 'location':
      return <LocationContent content={content} />;
    case 'contact':
      return <ContactContent content={content} />;
    case 'sticker':
      return content.media?.url ? (
        <img
          src={content.media.url}
          alt="Sticker"
          className="w-32 h-32 object-contain"
        />
      ) : null;
    case 'call':
      return (
        <div className="flex items-center gap-2 py-1">
          <div className="w-8 h-8 rounded-full bg-green-500/20 flex items-center justify-center flex-shrink-0">
            <Phone className="w-4 h-4 text-green-400" />
          </div>
          <span className="text-sm text-gray-300">{content.text || 'Phone call'}</span>
        </div>
      );
    case 'revoked':
      return (
        <div className="flex items-center gap-2 py-1 opacity-60">
          <Ban className="w-3.5 h-3.5 text-gray-500" />
          <span className="text-sm text-gray-500 italic">{content.text || 'This message was deleted'}</span>
        </div>
      );
    case 'system':
      return (
        <p className="text-center text-xs text-gray-400 italic">
          {content.text}
        </p>
      );
    default:
      return (
        <TextContent
          text={content.text}
          storedLinkPreview={metadata?.linkPreview as StoredLinkPreview | undefined}
        />
      );
  }
};

/**
 * Context menu for message actions
 */
const ContextMenu: React.FC<{
  isOpen: boolean;
  onClose: () => void;
  onReply?: () => void;
  onCopy?: () => void;
  onDelete?: () => void;
  onTranslate?: () => void;
  onAddToLibrary?: () => void;
  isOwn: boolean;
  isTranslating?: boolean;
  isDocument?: boolean;
}> = ({ isOpen, onClose, onReply, onCopy, onDelete, onTranslate, onAddToLibrary, isOwn, isTranslating, isDocument }) => {
  const menuRef = useRef<HTMLDivElement>(null);

  if (!isOpen) return null;

  return (
    <>
      <div className="fixed inset-0 z-40" onClick={onClose} />
      <div
        ref={menuRef}
        className={cn(
          'absolute z-50 bg-slate-700 rounded-lg shadow-xl border border-slate-600 py-1 min-w-[120px]',
          // Menu opens below the button, aligned to the side
          isOwn
            ? 'right-0 top-full mt-1'
            : 'left-0 top-full mt-1'
        )}
      >
        {onReply && (
          <button
            type="button"
            onClick={() => {
              onReply();
              onClose();
            }}
            className="w-full px-3 py-2 text-left text-sm hover:bg-slate-600 flex items-center gap-2"
          >
            <Reply className="w-4 h-4" />
            Reply
          </button>
        )}
        {onCopy && (
          <button
            type="button"
            onClick={() => {
              onCopy();
              onClose();
            }}
            className="w-full px-3 py-2 text-left text-sm hover:bg-slate-600 flex items-center gap-2"
          >
            <Copy className="w-4 h-4" />
            Copy
          </button>
        )}
        {/* Translate option for incoming messages */}
        {!isOwn && onTranslate && (
          <button
            type="button"
            onClick={() => {
              onTranslate();
              onClose();
            }}
            disabled={isTranslating}
            className="w-full px-3 py-2 text-left text-sm hover:bg-slate-600 flex items-center gap-2 text-sky-400 disabled:opacity-50"
          >
            {isTranslating ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Languages className="w-4 h-4" />
            )}
            Translate
          </button>
        )}
        {/* Add to Library option for document messages */}
        {isDocument && onAddToLibrary && (
          <button
            type="button"
            onClick={() => {
              onAddToLibrary();
              onClose();
            }}
            className="w-full px-3 py-2 text-left text-sm hover:bg-slate-600 flex items-center gap-2 text-emerald-400"
          >
            <BookOpen className="w-4 h-4" />
            Add to Library
          </button>
        )}
        {isOwn && onDelete && (
          <button
            type="button"
            onClick={() => {
              onDelete();
              onClose();
            }}
            className="w-full px-3 py-2 text-left text-sm text-red-400 hover:bg-slate-600 flex items-center gap-2"
          >
            <Trash2 className="w-4 h-4" />
            Delete
          </button>
        )}
      </div>
    </>
  );
};

/**
 * Translation display component
 */
const TranslationDisplay: React.FC<{
  translatedText: string;
  originalText?: string;
  showOriginal?: boolean;
  onToggle?: () => void;
  provider?: string;
}> = ({ translatedText, originalText, showOriginal = false, onToggle, provider }) => {
  return (
    <div className="mt-2 pt-2 border-t border-white/10">
      <div className="flex items-center justify-between mb-1">
        <span className="text-xs text-sky-300 font-medium flex items-center gap-1">
          <Languages className="w-3 h-3" />
          Translated
          {provider && <span className="text-gray-400">via SuperBrain</span>}
        </span>
        {originalText && onToggle && (
          <button
            onClick={onToggle}
            className="text-xs text-gray-400 hover:text-gray-300 flex items-center gap-1"
          >
            {showOriginal ? (
              <>
                <ChevronUp className="w-3 h-3" />
                Hide original
              </>
            ) : (
              <>
                <ChevronDown className="w-3 h-3" />
                Show original
              </>
            )}
          </button>
        )}
      </div>
      <p className="whitespace-pre-wrap break-words text-white/90">{translatedText}</p>
      {showOriginal && originalText && (
        <p className="mt-2 text-sm text-gray-400 italic whitespace-pre-wrap break-words">
          Original: {originalText}
        </p>
      )}
    </div>
  );
};

/**
 * OCR extracted text display component
 * Shows extracted text in monospace format
 */
const OCRDisplay: React.FC<{
  extractedText: string;
  confidence?: number;
  isExpanded?: boolean;
  onToggle?: () => void;
}> = ({ extractedText, confidence, isExpanded = true, onToggle }) => {
  if (!extractedText) return null;

  return (
    <div className="mt-2 pt-2 border-t border-white/10">
      <div className="flex items-center justify-between mb-1">
        <span className="text-xs text-amber-300 font-medium flex items-center gap-1">
          <ScanText className="w-3 h-3" />
          Extracted Text (OCR)
          {confidence !== undefined && (
            <span className="text-gray-400">
              {Math.round(confidence * 100)}% confidence
            </span>
          )}
        </span>
        {onToggle && (
          <button
            type="button"
            onClick={onToggle}
            className="text-xs text-gray-400 hover:text-gray-300 flex items-center gap-1"
          >
            {isExpanded ? (
              <>
                <ChevronUp className="w-3 h-3" />
                Hide
              </>
            ) : (
              <>
                <ChevronDown className="w-3 h-3" />
                Show
              </>
            )}
          </button>
        )}
      </div>
      {isExpanded && (
        <pre className="font-mono text-sm bg-black/30 rounded p-2 whitespace-pre-wrap break-words text-white/90 max-h-48 overflow-y-auto">
          <code>{extractedText}</code>
        </pre>
      )}
    </div>
  );
};

/**
 * Vision AI analysis display component
 * Shows AI-generated image description in formatted monospace block
 */
const VisionAIDisplay: React.FC<{
  description: string;
  provider?: string;
  model?: string;
  isExpanded?: boolean;
  onToggle?: () => void;
}> = ({ description, provider, model, isExpanded = true, onToggle }) => {
  if (!description) return null;

  // Clean up the description - remove [Image Description]: prefix if present
  const cleanDescription = description.replace(/^\[Image Description\]:\s*/i, '').trim();

  return (
    <div className="mt-2 pt-2 border-t border-white/10">
      <div className="flex items-center justify-between mb-1">
        <span className="text-xs text-purple-300 font-medium flex items-center gap-1">
          <Eye className="w-3 h-3" />
          Vision AI Analysis
          {(provider || model) && (
            <span className="text-gray-400">
              {provider && model ? `${provider} / ${model}` : provider || model}
            </span>
          )}
        </span>
        {onToggle && (
          <button
            type="button"
            onClick={onToggle}
            className="text-xs text-gray-400 hover:text-gray-300 flex items-center gap-1"
          >
            {isExpanded ? (
              <>
                <ChevronUp className="w-3 h-3" />
                Hide
              </>
            ) : (
              <>
                <ChevronDown className="w-3 h-3" />
                Show
              </>
            )}
          </button>
        )}
      </div>
      {isExpanded && (
        <pre className="font-mono text-sm bg-black/30 rounded p-2 whitespace-pre-wrap break-words text-white/90 max-h-60 overflow-y-auto leading-relaxed">
          <code>{cleanDescription}</code>
        </pre>
      )}
    </div>
  );
};

/**
 * MessageBubble component for displaying chat messages
 * Supports various content types: text, image, video, audio, document, location, contact
 * Includes AI-powered translation for incoming messages
 *
 * @example
 * ```tsx
 * <MessageBubble
 *   message={message}
 *   isOwn={message.direction === 'outgoing'}
 *   showAvatar={true}
 *   onReply={handleReply}
 *   onMediaClick={handleMediaPreview}
 *   translationLanguage="en"
 *   authToken={token}
 * />
 * ```
 */
export const MessageBubble: React.FC<MessageBubbleProps> = ({
  message,
  isOwn,
  showAvatar = false,
  isGroup = false,
  senderColor,
  onReply,
  onReact,
  onCopy,
  onDelete,
  onMediaClick,
  translationLanguage = 'en',
  authToken,
  className,
}) => {
  const [showMenu, setShowMenu] = useState(false);
  const [isTranslating, setIsTranslating] = useState(false);
  const [translatedText, setTranslatedText] = useState<string | null>(null);
  const [showOriginal, setShowOriginal] = useState(false);
  const [translationProvider, setTranslationProvider] = useState<string | null>(null);

  // Add to Library state
  const [showLibraryPicker, setShowLibraryPicker] = useState(false);
  const [libraries, setLibraries] = useState<Array<{ id: string; name: string }>>([]);
  const [isIngesting, setIsIngesting] = useState(false);
  const [ingestResult, setIngestResult] = useState<{ success: boolean; message: string } | null>(null);

  // OCR state
  const [isExtracting, setIsExtracting] = useState(false);
  const [ocrText, setOcrText] = useState<string | null>(null);
  const [ocrConfidence, setOcrConfidence] = useState<number | undefined>();
  const [showOcrText, setShowOcrText] = useState(true);
  const [ocrUnavailable, setOcrUnavailable] = useState(false);

  // Vision AI state
  const [visionDescription, setVisionDescription] = useState<string | null>(null);
  const [showVisionDescription, setShowVisionDescription] = useState(true);

  // Load pre-extracted OCR text from message metadata (auto-extracted by SuperBrain)
  useEffect(() => {
    const metadata = message.metadata as Record<string, unknown> | undefined;
    if (metadata?.ocrExtracted && message.content?.text) {
      // OCR was auto-extracted - load the text
      setOcrText(message.content.text);
      if (typeof metadata.ocrConfidence === 'number') {
        setOcrConfidence(metadata.ocrConfidence);
      }
    }
  }, [message.id, message.metadata, message.content?.text]);

  // Load pre-generated Vision AI description from message metadata
  useEffect(() => {
    const metadata = message.metadata as Record<string, unknown> | undefined;
    // Check for visionDescription flag (set by SuperBrain auto-analysis)
    if (metadata?.visionDescription && message.content?.text) {
      setVisionDescription(message.content.text);
    }
    // Also check for autoAnalyzed with analysisType: 'vision_ai'
    else if (metadata?.autoAnalyzed && metadata?.analysisType === 'vision_ai' && message.content?.text) {
      setVisionDescription(message.content.text);
    }
  }, [message.id, message.metadata, message.content?.text]);

  /**
   * Get auth token from various sources
   */
  const getAuthToken = useCallback(() => {
    // 1. Try from prop
    if (authToken) return authToken;

    // 2. Try direct token (some components store it directly)
    const directToken = localStorage.getItem('token');
    if (directToken) return directToken;

    // 3. Try from Zustand persisted state (swarm-auth)
    try {
      const swarmAuth = localStorage.getItem('swarm-auth');
      if (swarmAuth) {
        const parsed = JSON.parse(swarmAuth);
        return parsed?.state?.token || null;
      }
    } catch {
      // Ignore parse errors
    }

    return null;
  }, [authToken]);

  /**
   * Handle translate button click
   */
  const handleTranslate = useCallback(async () => {
    if (!message.content.text || isTranslating || translatedText) return;

    // Get auth token
    const token = getAuthToken();

    setIsTranslating(true);
    try {
      const response = await fetch('/api/ai/translate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token && { Authorization: `Bearer ${token}` }),
        },
        body: JSON.stringify({
          message: message.content.text,
          targetLanguage: translationLanguage,
          platform: message.platform,
        }),
      });

      if (response.ok) {
        const data = await response.json();
        if (data.success && data.translatedMessage) {
          setTranslatedText(data.translatedMessage);
          setTranslationProvider(data.provider || null);
        }
      } else {
        console.error('Translation failed:', response.status, response.statusText);
      }
    } catch (error) {
      console.error('Translation failed:', error);
    } finally {
      setIsTranslating(false);
    }
  }, [message.content.text, message.platform, translationLanguage, getAuthToken, isTranslating, translatedText]);

  /**
   * Handle "Add to Library" click - fetch libraries and show picker
   */
  const handleAddToLibrary = useCallback(async () => {
    const token = getAuthToken();
    if (!token) return;

    try {
      const response = await fetch('/api/knowledge/libraries', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (response.ok) {
        const data = await response.json();
        const libs = (data.libraries || data || []).map((l: Record<string, unknown>) => ({ id: l.id as string, name: l.name as string }));
        setLibraries(libs);
        setShowLibraryPicker(true);
        setIngestResult(null);
      }
    } catch (error) {
      console.error('Failed to fetch libraries:', error);
    }
  }, [getAuthToken]);

  /**
   * Ingest document into selected library
   */
  const handleIngestToLibrary = useCallback(async (libraryId: string) => {
    const token = getAuthToken();
    if (!token || isIngesting) return;

    setIsIngesting(true);
    setIngestResult(null);
    try {
      const response = await fetch(`/api/knowledge/libraries/${libraryId}/ingest/from-message`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ messageId: message.id }),
      });

      const data = await response.json();
      if (response.ok && data.success) {
        setIngestResult({
          success: true,
          message: `Added to "${data.libraryName}" (${data.chunksCreated} chunks)`,
        });
      } else {
        setIngestResult({
          success: false,
          message: data.error || 'Failed to ingest document',
        });
      }
    } catch (error) {
      setIngestResult({ success: false, message: 'Network error' });
    } finally {
      setIsIngesting(false);
    }
  }, [message.id, getAuthToken, isIngesting]);

  /**
   * Handle image analysis - tries OCR first, falls back to Vision AI
   */
  const handleAnalyzeImage = useCallback(async () => {
    if (isExtracting || ocrText || visionDescription || ocrUnavailable) return;

    // Get auth token
    const token = getAuthToken();

    setIsExtracting(true);
    try {
      const response = await fetch('/api/superbrain/analyze-image-message', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token && { Authorization: `Bearer ${token}` }),
        },
        body: JSON.stringify({
          messageId: message.id,
          updateMessage: true,
        }),
      });

      if (response.ok) {
        const data = await response.json();

        // Handle both services unavailable
        if (data.bothDisabled) {
          setOcrUnavailable(true);
          return;
        }

        if (data.success) {
          if (data.analysisType === 'ocr' && data.extractedText) {
            // OCR succeeded
            setOcrText(data.extractedText);
            setOcrConfidence(data.confidence);
          } else if (data.analysisType === 'vision' && data.description) {
            // Vision AI succeeded
            setVisionDescription(data.description);
          }
        } else if (!data.extractedText && !data.description) {
          // Neither found usable content
          setOcrText('');
        }
      } else {
        console.error('Image analysis failed:', response.status, response.statusText);
      }
    } catch (error) {
      console.error('Image analysis failed:', error);
    } finally {
      setIsExtracting(false);
    }
  }, [message.id, getAuthToken, isExtracting, ocrText, visionDescription, ocrUnavailable]);

  // Check if this is an image message that can be analyzed
  const isImageMessage = message.content.type === 'image' || message.content.type === 'sticker';
  const hasNoText = !message.content.text || message.content.text.trim() === '';
  const canAnalyzeImage = isImageMessage && hasNoText;

  // Determine bubble styling based on ownership and group status
  const bubbleClass = isOwn
    ? 'bg-sky-500 text-white rounded-[4px]'
    : cn(
        'bg-slate-700 text-white rounded-[4px]',
        // Add colored left border for group messages
        isGroup && senderColor && `border-l-4 ${senderColor.border}`
      );

  // System messages are centered
  if (message.content.type === 'system') {
    return (
      <div className="flex justify-center my-4">
        <div className="px-4 py-2 bg-slate-800 rounded-full text-xs text-gray-400">
          {message.content.text}
        </div>
      </div>
    );
  }

  return (
    <div
      className={cn(
        'flex gap-2 mb-2 group',
        isOwn ? 'justify-end' : 'justify-start',
        className
      )}
    >
      {/* Avatar for incoming messages */}
      {!isOwn && showAvatar && (
        <div className="w-8 h-8 rounded-full bg-slate-600 flex items-center justify-center flex-shrink-0 overflow-hidden">
          {message.sender.avatarUrl ? (
            <>
              <img
                src={message.sender.avatarUrl}
                alt={message.sender.name}
                className="w-full h-full rounded-full object-cover"
                onError={(e) => {
                  // Hide broken image and show fallback initial
                  (e.target as HTMLImageElement).style.display = 'none';
                  const fallback = (e.target as HTMLImageElement).nextElementSibling;
                  if (fallback) (fallback as HTMLElement).style.display = 'flex';
                }}
              />
              {/* Fallback initial - hidden by default, shown on image error */}
              <span className="hidden text-xs font-medium text-gray-300 w-full h-full items-center justify-center">
                {message.sender.name.charAt(0).toUpperCase()}
              </span>
            </>
          ) : (
            <span className="text-xs font-medium text-gray-300">
              {message.sender.name.charAt(0).toUpperCase()}
            </span>
          )}
        </div>
      )}

      {/* Message content */}
      {/* Wider bubble for email HTML content - check both platform and content */}
      <div className={cn(
        'relative',
        // Email HTML content gets much wider for better readability
        (message.platform === 'email' || (message.content.text && isHtmlContent(message.content.text)))
          ? 'w-full max-w-[900px] md:min-w-[600px]'
          : 'max-w-[70%]',
        isOwn && 'order-first'
      )}>
        {/* Sender name for incoming messages */}
        {!isOwn && showAvatar && (
          <div className="flex items-center gap-2 mb-1">
            <span className={cn(
              'text-xs font-medium',
              isGroup && senderColor ? senderColor.text : 'text-gray-300'
            )}>
              {message.sender.name}
            </span>
            {message.agentName && (
              <span className={cn('text-xs', getPlatformColor(message.platform))}>
                via {message.agentName}
              </span>
            )}
          </div>
        )}

        {/* Reply preview */}
        <ReplyPreview replyToId={message.replyToId} />

        {/* Bubble content with context menu outside */}
        <div className="flex items-start gap-1">
          {/* Context menu trigger - LEFT side for own messages */}
          {isOwn && (
            <div className="relative flex-shrink-0 self-center">
              <button
                type="button"
                title="Message actions"
                onClick={() => setShowMenu(!showMenu)}
                className="opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded hover:bg-black/20"
              >
                <MoreVertical className="w-4 h-4 text-gray-400" />
              </button>
              <ContextMenu
                isOpen={showMenu}
                onClose={() => setShowMenu(false)}
                onReply={onReply}
                onCopy={onCopy}
                onDelete={onDelete}
                onTranslate={message.content.text ? handleTranslate : undefined}
                onAddToLibrary={message.content.type === 'document' ? handleAddToLibrary : undefined}
                isOwn={isOwn}
                isTranslating={isTranslating}
                isDocument={message.content.type === 'document'}
              />
            </div>
          )}

        <div className={cn(
          bubbleClass,
          'px-4 py-2 relative',
          // Full width for email HTML content
          (message.platform === 'email' || (message.content.text && isHtmlContent(message.content.text))) && 'w-full'
        )}>
          {/* Message content */}
          <MessageContentRenderer
            content={message.content}
            onMediaClick={onMediaClick}
            metadata={message.metadata as Record<string, unknown>}
            platform={message.platform}
          />

          {/* Translation display */}
          {translatedText && (
            <TranslationDisplay
              translatedText={translatedText}
              originalText={message.content.text}
              showOriginal={showOriginal}
              onToggle={() => setShowOriginal(!showOriginal)}
              provider={translationProvider || undefined}
            />
          )}

          {/* Translation loading indicator */}
          {isTranslating && (
            <div className="mt-2 pt-2 border-t border-white/10 flex items-center gap-2 text-xs text-sky-300">
              <Loader2 className="w-3 h-3 animate-spin" />
              Translating via SuperBrain...
            </div>
          )}

          {/* OCR extracted text display */}
          {ocrText && (
            <OCRDisplay
              extractedText={ocrText}
              confidence={ocrConfidence}
              isExpanded={showOcrText}
              onToggle={() => setShowOcrText(!showOcrText)}
            />
          )}

          {/* Vision AI description display */}
          {visionDescription && !ocrText && (
            <VisionAIDisplay
              description={visionDescription}
              isExpanded={showVisionDescription}
              onToggle={() => setShowVisionDescription(!showVisionDescription)}
            />
          )}

          {/* Image analysis loading indicator */}
          {isExtracting && (
            <div className="mt-2 pt-2 border-t border-white/10 flex items-center gap-2 text-xs text-amber-300">
              <Loader2 className="w-3 h-3 animate-spin" />
              Analyzing image...
            </div>
          )}

          {/* Library picker for document messages */}
          {showLibraryPicker && (
            <div className="mt-2 pt-2 border-t border-white/10">
              <div className="flex items-center gap-1 mb-1.5">
                <BookOpen className="w-3 h-3 text-emerald-400" />
                <span className="text-xs text-emerald-400 font-medium">Add to Library</span>
              </div>
              {isIngesting ? (
                <div className="flex items-center gap-2 text-xs text-emerald-300">
                  <Loader2 className="w-3 h-3 animate-spin" />
                  Ingesting document...
                </div>
              ) : ingestResult ? (
                <div className={cn('text-xs px-2 py-1.5 rounded', ingestResult.success ? 'bg-emerald-500/20 text-emerald-300' : 'bg-red-500/20 text-red-300')}>
                  {ingestResult.success ? '✓' : '✗'} {ingestResult.message}
                  <button
                    type="button"
                    onClick={() => { setShowLibraryPicker(false); setIngestResult(null); }}
                    className="ml-2 underline text-gray-400 hover:text-gray-300"
                  >
                    Close
                  </button>
                </div>
              ) : libraries.length === 0 ? (
                <p className="text-xs text-gray-400">No libraries found. Create one in Knowledge Base first.</p>
              ) : (
                <div className="flex flex-wrap gap-1">
                  {libraries.map((lib) => (
                    <button
                      key={lib.id}
                      type="button"
                      onClick={() => handleIngestToLibrary(lib.id)}
                      className="px-2 py-1 text-xs bg-slate-600 hover:bg-emerald-600/50 rounded transition-colors truncate max-w-[140px]"
                      title={lib.name}
                    >
                      {lib.name}
                    </button>
                  ))}
                  <button
                    type="button"
                    onClick={() => setShowLibraryPicker(false)}
                    className="px-2 py-1 text-xs text-gray-400 hover:text-gray-300"
                  >
                    Cancel
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Timestamp, AI badge, and status */}
          <div
            className={cn(
              'flex items-center gap-1.5 mt-1 text-xs flex-wrap',
              isOwn ? 'justify-end text-sky-200' : 'text-gray-400'
            )}
          >
            <span>{formatTime(message.timestamp)}</span>
            {message.editedAt && <span>(edited)</span>}
            {/* AI Generated badge */}
            {message.isFromAI && (
              <span className="px-1.5 py-0.5 bg-emerald-400/20 text-emerald-400 rounded text-[10px] font-medium">
                AI Generated
              </span>
            )}
            {isOwn && <MessageStatus status={message.status} />}
          </div>
        </div>

          {/* Context menu trigger - RIGHT side for incoming messages */}
          {!isOwn && (
            <div className="relative flex-shrink-0 self-center">
              <button
                type="button"
                title="Message actions"
                onClick={() => setShowMenu(!showMenu)}
                className="opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded hover:bg-black/20"
              >
                <MoreVertical className="w-4 h-4 text-gray-400" />
              </button>
              <ContextMenu
                isOpen={showMenu}
                onClose={() => setShowMenu(false)}
                onReply={onReply}
                onCopy={onCopy}
                onDelete={onDelete}
                onTranslate={message.content.text ? handleTranslate : undefined}
                onAddToLibrary={message.content.type === 'document' ? handleAddToLibrary : undefined}
                isOwn={isOwn}
                isTranslating={isTranslating}
                isDocument={message.content.type === 'document'}
              />
            </div>
          )}
        </div>

        {/* Reactions */}
        <ReactionsDisplay reactions={message.reactions} />

        {/* Inline translate button for incoming text messages */}
        {!isOwn && message.content.text && !translatedText && (
          <div className="mt-1 flex items-center gap-2">
            <button
              type="button"
              onClick={handleTranslate}
              disabled={isTranslating}
              className={cn(
                'px-2 py-1 rounded-full text-xs font-medium',
                'bg-slate-600/50 hover:bg-slate-500/50',
                'text-gray-300 hover:text-white',
                'flex items-center gap-1.5',
                'transition-all duration-200',
                'disabled:opacity-50 disabled:cursor-not-allowed'
              )}
            >
              {isTranslating ? (
                <>
                  <Loader2 className="w-3 h-3 animate-spin" />
                  <span>Translating...</span>
                </>
              ) : (
                <>
                  <Languages className="w-3 h-3" />
                  <span>Translate</span>
                </>
              )}
            </button>
          </div>
        )}

        {/* Show original button when translated */}
        {!isOwn && translatedText && (
          <div className="mt-1 flex items-center gap-2">
            <button
              type="button"
              onClick={() => setShowOriginal(!showOriginal)}
              className={cn(
                'px-2 py-1 rounded-full text-xs font-medium',
                'bg-sky-500/20 hover:bg-sky-500/30',
                'text-sky-300 hover:text-sky-200',
                'flex items-center gap-1.5',
                'transition-all duration-200'
              )}
            >
              <Languages className="w-3 h-3" />
              <span>{showOriginal ? 'Hide Original' : 'Show Original'}</span>
            </button>
          </div>
        )}

        {/* Analyze image button for image messages without text */}
        {canAnalyzeImage && !ocrText && !visionDescription && !ocrUnavailable && (
          <div className="mt-1 flex items-center gap-2">
            <button
              type="button"
              onClick={handleAnalyzeImage}
              disabled={isExtracting}
              className={cn(
                'px-2 py-1 rounded-full text-xs font-medium',
                'bg-amber-500/20 hover:bg-amber-500/30',
                'text-amber-300 hover:text-amber-200',
                'flex items-center gap-1.5',
                'transition-all duration-200',
                'disabled:opacity-50 disabled:cursor-not-allowed'
              )}
            >
              {isExtracting ? (
                <>
                  <Loader2 className="w-3 h-3 animate-spin" />
                  <span>Analyzing...</span>
                </>
              ) : (
                <>
                  <ScanText className="w-3 h-3" />
                  <span>Analyze Image</span>
                </>
              )}
            </button>
          </div>
        )}

        {/* Analysis unavailable message */}
        {canAnalyzeImage && ocrUnavailable && !ocrText && !visionDescription && (
          <div className="mt-1 flex items-center gap-2">
            <span className="px-2 py-1 rounded-full text-xs font-medium bg-slate-600/50 text-slate-400 flex items-center gap-1.5">
              <ScanText className="w-3 h-3" />
              <span>Image analysis unavailable (enable OCR or Vision AI)</span>
            </span>
          </div>
        )}

        {/* Toggle OCR text visibility when already extracted */}
        {ocrText && (
          <div className="mt-1 flex items-center gap-2">
            <button
              type="button"
              onClick={() => setShowOcrText(!showOcrText)}
              className={cn(
                'px-2 py-1 rounded-full text-xs font-medium',
                'bg-amber-500/20 hover:bg-amber-500/30',
                'text-amber-300 hover:text-amber-200',
                'flex items-center gap-1.5',
                'transition-all duration-200'
              )}
            >
              <ScanText className="w-3 h-3" />
              <span>{showOcrText ? 'Hide OCR Text' : 'Show OCR Text'}</span>
            </button>
          </div>
        )}

        {/* Toggle Vision AI description visibility when already generated */}
        {visionDescription && !ocrText && (
          <div className="mt-1 flex items-center gap-2">
            <button
              type="button"
              onClick={() => setShowVisionDescription(!showVisionDescription)}
              className={cn(
                'px-2 py-1 rounded-full text-xs font-medium',
                'bg-purple-500/20 hover:bg-purple-500/30',
                'text-purple-300 hover:text-purple-200',
                'flex items-center gap-1.5',
                'transition-all duration-200'
              )}
            >
              <Eye className="w-3 h-3" />
              <span>{showVisionDescription ? 'Hide Vision AI' : 'Show Vision AI'}</span>
            </button>
          </div>
        )}
      </div>

      {/* Avatar space for outgoing messages (for alignment) */}
      {isOwn && showAvatar && <div className="w-8 flex-shrink-0" />}
    </div>
  );
};

export default MessageBubble;
