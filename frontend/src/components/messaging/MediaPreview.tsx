import React, { useState, useEffect, useCallback } from 'react';
import {
  X,
  Download,
  ChevronLeft,
  ChevronRight,
  ZoomIn,
  ZoomOut,
  RotateCw,
  Maximize2,
  Minimize2,
} from 'lucide-react';
import { cn } from '../../lib/utils';

export interface MediaItem {
  /** Unique ID for the media */
  id: string;
  /** URL of the media */
  url: string;
  /** Type of media */
  type: 'image' | 'video';
  /** Optional caption */
  caption?: string;
  /** Optional filename for download */
  filename?: string;
}

export interface MediaPreviewProps {
  /** Whether the preview is open */
  open: boolean;
  /** Callback when preview should close */
  onClose: () => void;
  /** List of media items to display */
  items: MediaItem[];
  /** Initially selected item index */
  initialIndex?: number;
  /** Additional class names */
  className?: string;
}

/**
 * Full-screen media preview modal for images and videos
 * Features navigation, zoom, download, and fullscreen support
 *
 * @example
 * ```tsx
 * <MediaPreview
 *   open={isPreviewOpen}
 *   onClose={() => setIsPreviewOpen(false)}
 *   items={[
 *     { id: '1', url: '/image1.jpg', type: 'image', caption: 'Photo 1' },
 *     { id: '2', url: '/video1.mp4', type: 'video' },
 *   ]}
 *   initialIndex={0}
 * />
 * ```
 */
export const MediaPreview: React.FC<MediaPreviewProps> = ({
  open,
  onClose,
  items,
  initialIndex = 0,
  className,
}) => {
  const [currentIndex, setCurrentIndex] = useState(initialIndex);
  const [zoom, setZoom] = useState(1);
  const [rotation, setRotation] = useState(0);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [position, setPosition] = useState({ x: 0, y: 0 });

  const currentItem = items[currentIndex];

  // Reset state when changing items
  useEffect(() => {
    setZoom(1);
    setRotation(0);
    setPosition({ x: 0, y: 0 });
  }, [currentIndex]);

  // Reset current index when items change
  useEffect(() => {
    if (initialIndex >= 0 && initialIndex < items.length) {
      setCurrentIndex(initialIndex);
    }
  }, [initialIndex, items.length]);

  // Handle keyboard navigation
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (!open) return;

      switch (e.key) {
        case 'Escape':
          onClose();
          break;
        case 'ArrowLeft':
          if (currentIndex > 0) {
            setCurrentIndex(currentIndex - 1);
          }
          break;
        case 'ArrowRight':
          if (currentIndex < items.length - 1) {
            setCurrentIndex(currentIndex + 1);
          }
          break;
        case '+':
        case '=':
          setZoom((prev) => Math.min(prev + 0.25, 3));
          break;
        case '-':
          setZoom((prev) => Math.max(prev - 0.25, 0.5));
          break;
        case 'r':
        case 'R':
          setRotation((prev) => (prev + 90) % 360);
          break;
        case '0':
          setZoom(1);
          setRotation(0);
          setPosition({ x: 0, y: 0 });
          break;
      }
    },
    [open, currentIndex, items.length, onClose]
  );

  useEffect(() => {
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  // Lock body scroll when open
  useEffect(() => {
    if (open) {
      document.body.style.overflow = 'hidden';
      return () => {
        document.body.style.overflow = '';
      };
    }
  }, [open]);

  // Handle fullscreen
  const toggleFullscreen = async () => {
    if (!document.fullscreenElement) {
      await document.documentElement.requestFullscreen();
      setIsFullscreen(true);
    } else {
      await document.exitFullscreen();
      setIsFullscreen(false);
    }
  };

  // Handle download
  const handleDownload = async () => {
    if (!currentItem) return;

    try {
      const response = await fetch(currentItem.url);
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = currentItem.filename || `media-${currentItem.id}.${currentItem.type === 'image' ? 'jpg' : 'mp4'}`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Download failed:', error);
    }
  };

  // Handle mouse drag for panning
  const handleMouseDown = (e: React.MouseEvent) => {
    if (zoom <= 1) return;
    setIsDragging(true);
    setDragStart({ x: e.clientX - position.x, y: e.clientY - position.y });
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging) return;
    setPosition({
      x: e.clientX - dragStart.x,
      y: e.clientY - dragStart.y,
    });
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  // Navigate to previous/next
  const goToPrevious = () => {
    if (currentIndex > 0) {
      setCurrentIndex(currentIndex - 1);
    }
  };

  const goToNext = () => {
    if (currentIndex < items.length - 1) {
      setCurrentIndex(currentIndex + 1);
    }
  };

  // Zoom controls
  const zoomIn = () => setZoom((prev) => Math.min(prev + 0.25, 3));
  const zoomOut = () => setZoom((prev) => Math.max(prev - 0.25, 0.5));
  const resetZoom = () => {
    setZoom(1);
    setPosition({ x: 0, y: 0 });
  };

  // Rotate
  const rotate = () => setRotation((prev) => (prev + 90) % 360);

  if (!open || !currentItem) {
    return null;
  }

  return (
    <div
      className={cn(
        'fixed inset-0 z-50 flex flex-col bg-black/95',
        className
      )}
      onClick={onClose}
    >
      {/* Header */}
      <div
        className="flex items-center justify-between px-4 py-3 bg-black/50"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-4">
          {/* Counter */}
          {items.length > 1 && (
            <span className="text-sm text-gray-400">
              {currentIndex + 1} / {items.length}
            </span>
          )}
        </div>

        <div className="flex items-center gap-2">
          {/* Zoom controls (images only) */}
          {currentItem.type === 'image' && (
            <>
              <button
                onClick={zoomOut}
                disabled={zoom <= 0.5}
                className="p-2 text-gray-400 hover:text-white hover:bg-white/10 rounded-lg transition-colors disabled:opacity-50"
                title="Zoom out (-)"
              >
                <ZoomOut className="w-5 h-5" />
              </button>
              <button
                onClick={resetZoom}
                className="px-2 py-1 text-sm text-gray-400 hover:text-white hover:bg-white/10 rounded-lg transition-colors"
                title="Reset (0)"
              >
                {Math.round(zoom * 100)}%
              </button>
              <button
                onClick={zoomIn}
                disabled={zoom >= 3}
                className="p-2 text-gray-400 hover:text-white hover:bg-white/10 rounded-lg transition-colors disabled:opacity-50"
                title="Zoom in (+)"
              >
                <ZoomIn className="w-5 h-5" />
              </button>
              <div className="w-px h-6 bg-gray-700 mx-2" />
              <button
                onClick={rotate}
                className="p-2 text-gray-400 hover:text-white hover:bg-white/10 rounded-lg transition-colors"
                title="Rotate (R)"
              >
                <RotateCw className="w-5 h-5" />
              </button>
            </>
          )}

          {/* Fullscreen */}
          <button
            onClick={toggleFullscreen}
            className="p-2 text-gray-400 hover:text-white hover:bg-white/10 rounded-lg transition-colors"
            title="Toggle fullscreen"
          >
            {isFullscreen ? (
              <Minimize2 className="w-5 h-5" />
            ) : (
              <Maximize2 className="w-5 h-5" />
            )}
          </button>

          {/* Download */}
          <button
            onClick={handleDownload}
            className="p-2 text-gray-400 hover:text-white hover:bg-white/10 rounded-lg transition-colors"
            title="Download"
          >
            <Download className="w-5 h-5" />
          </button>

          <div className="w-px h-6 bg-gray-700 mx-2" />

          {/* Close */}
          <button
            onClick={onClose}
            className="p-2 text-gray-400 hover:text-white hover:bg-white/10 rounded-lg transition-colors"
            title="Close (Esc)"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Main content area */}
      <div
        className="flex-1 flex items-center justify-center overflow-hidden relative"
        onClick={(e) => e.stopPropagation()}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        style={{ cursor: zoom > 1 ? (isDragging ? 'grabbing' : 'grab') : 'default' }}
      >
        {/* Navigation arrows */}
        {items.length > 1 && (
          <>
            <button
              onClick={(e) => {
                e.stopPropagation();
                goToPrevious();
              }}
              disabled={currentIndex === 0}
              className={cn(
                'absolute left-4 z-10 p-3 bg-black/50 hover:bg-black/70 rounded-full transition-all',
                currentIndex === 0 && 'opacity-30 cursor-not-allowed'
              )}
            >
              <ChevronLeft className="w-6 h-6 text-white" />
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation();
                goToNext();
              }}
              disabled={currentIndex === items.length - 1}
              className={cn(
                'absolute right-4 z-10 p-3 bg-black/50 hover:bg-black/70 rounded-full transition-all',
                currentIndex === items.length - 1 && 'opacity-30 cursor-not-allowed'
              )}
            >
              <ChevronRight className="w-6 h-6 text-white" />
            </button>
          </>
        )}

        {/* Media content */}
        <div
          className="max-w-full max-h-full transition-transform duration-200"
          style={{
            transform: `translate(${position.x}px, ${position.y}px) scale(${zoom}) rotate(${rotation}deg)`,
          }}
        >
          {currentItem.type === 'image' ? (
            <img
              src={currentItem.url}
              alt={currentItem.caption || 'Preview image'}
              className="max-w-[90vw] max-h-[80vh] object-contain select-none"
              draggable={false}
            />
          ) : (
            <video
              src={currentItem.url}
              controls
              autoPlay
              className="max-w-[90vw] max-h-[80vh] outline-none"
            />
          )}
        </div>
      </div>

      {/* Footer with caption and thumbnails */}
      <div
        className="px-4 py-3 bg-black/50"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Caption */}
        {currentItem.caption && (
          <p className="text-center text-white mb-3">{currentItem.caption}</p>
        )}

        {/* Thumbnail strip */}
        {items.length > 1 && (
          <div className="flex items-center justify-center gap-2 overflow-x-auto pb-2">
            {items.map((item, index) => (
              <button
                key={item.id}
                onClick={() => setCurrentIndex(index)}
                className={cn(
                  'w-16 h-16 rounded-lg overflow-hidden border-2 transition-all flex-shrink-0',
                  index === currentIndex
                    ? 'border-sky-500 opacity-100'
                    : 'border-transparent opacity-60 hover:opacity-100'
                )}
              >
                {item.type === 'image' ? (
                  <img
                    src={item.url}
                    alt={`Thumbnail ${index + 1}`}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="w-full h-full bg-slate-700 flex items-center justify-center">
                    <span className="text-xs text-gray-400">Video</span>
                  </div>
                )}
              </button>
            ))}
          </div>
        )}

        {/* Keyboard shortcuts hint */}
        <p className="text-center text-xs text-gray-500 mt-2">
          Use arrow keys to navigate, +/- to zoom, R to rotate, Esc to close
        </p>
      </div>
    </div>
  );
};

export default MediaPreview;
