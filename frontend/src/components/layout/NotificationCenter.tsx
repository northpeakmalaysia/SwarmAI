import { useState, useRef, useEffect, useMemo } from 'react'
import {
  Bell,
  CheckCircle,
  AlertCircle,
  AlertTriangle,
  Info,
  X,
  Trash2,
  Check,
} from 'lucide-react'
import { useUIStore } from '../../stores/uiStore'
import { clsx } from 'clsx'
import type { Notification, NotificationType } from '../../types'
import { formatRelativeTime as formatRelativeTimeUtil } from '@/utils/dateFormat'

// Icon mapping for notification types
const notificationIcons: Record<NotificationType, typeof CheckCircle> = {
  success: CheckCircle,
  error: AlertCircle,
  warning: AlertTriangle,
  info: Info,
}

// Color classes for notification types
const notificationColors: Record<NotificationType, { bg: string; text: string; icon: string }> = {
  success: {
    bg: 'bg-green-500/10',
    text: 'text-green-400',
    icon: 'text-green-500',
  },
  error: {
    bg: 'bg-red-500/10',
    text: 'text-red-400',
    icon: 'text-red-500',
  },
  warning: {
    bg: 'bg-yellow-500/10',
    text: 'text-yellow-400',
    icon: 'text-yellow-500',
  },
  info: {
    bg: 'bg-blue-500/10',
    text: 'text-blue-400',
    icon: 'text-blue-500',
  },
}

// Delegate to shared utility with timezone support
function formatRelativeTime(dateString: string): string {
  return formatRelativeTimeUtil(dateString)
}

// Helper to group notifications by date
function groupNotificationsByDate(notifications: Notification[]): Map<string, Notification[]> {
  const groups = new Map<string, Notification[]>()
  const today = new Date()
  const yesterday = new Date(today)
  yesterday.setDate(yesterday.getDate() - 1)

  // Sort notifications by date (newest first)
  const sorted = [...notifications].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  )

  sorted.forEach((notification) => {
    const notifDate = new Date(notification.createdAt)
    let groupKey: string

    if (notifDate.toDateString() === today.toDateString()) {
      groupKey = 'Today'
    } else if (notifDate.toDateString() === yesterday.toDateString()) {
      groupKey = 'Yesterday'
    } else {
      groupKey = 'Earlier'
    }

    if (!groups.has(groupKey)) {
      groups.set(groupKey, [])
    }
    groups.get(groupKey)!.push(notification)
  })

  return groups
}

interface NotificationItemProps {
  notification: Notification
  onRemove: (id: string) => void
}

function NotificationItem({ notification, onRemove }: NotificationItemProps) {
  const Icon = notificationIcons[notification.type]
  const colors = notificationColors[notification.type]

  return (
    <div
      className={clsx(
        'flex items-start gap-3 p-3 rounded-lg transition-colors group',
        colors.bg,
        'hover:opacity-90'
      )}
    >
      <div className={clsx('flex-shrink-0 mt-0.5', colors.icon)}>
        <Icon className="w-5 h-5" />
      </div>
      <div className="flex-1 min-w-0">
        <p className={clsx('text-sm font-medium', colors.text)}>
          {notification.title}
        </p>
        {notification.message && (
          <p className="text-xs text-gray-400 mt-0.5 line-clamp-2">
            {notification.message}
          </p>
        )}
        <p className="text-xs text-gray-500 mt-1">
          {formatRelativeTime(notification.createdAt)}
        </p>
        {notification.action && (
          <button
            onClick={notification.action.onClick}
            className={clsx(
              'text-xs font-medium mt-2',
              colors.text,
              'hover:underline'
            )}
          >
            {notification.action.label}
          </button>
        )}
      </div>
      {notification.dismissible !== false && (
        <button
          onClick={() => onRemove(notification.id)}
          className="flex-shrink-0 p-1 text-gray-500 hover:text-gray-300 opacity-0 group-hover:opacity-100 transition-opacity"
          aria-label="Dismiss notification"
        >
          <X className="w-4 h-4" />
        </button>
      )}
    </div>
  )
}

export default function NotificationCenter() {
  const { notifications, removeNotification, clearNotifications } = useUIStore()
  const [isOpen, setIsOpen] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)
  const [, forceUpdate] = useState(0)

  // Update relative times every minute when dropdown is open
  useEffect(() => {
    if (!isOpen || notifications.length === 0) return

    const interval = setInterval(() => {
      forceUpdate((n) => n + 1)
    }, 60000) // Update every minute

    return () => clearInterval(interval)
  }, [isOpen, notifications.length])

  // Close dropdown on click outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false)
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const unreadCount = notifications.length
  const groupedNotifications = useMemo(
    () => groupNotificationsByDate(notifications),
    [notifications]
  )

  return (
    <div ref={dropdownRef} className="relative">
      {/* Bell Button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="relative p-2 text-gray-400 hover:text-white hover:bg-swarm-dark rounded-lg transition-colors"
        aria-label={`Notifications${unreadCount > 0 ? ` (${unreadCount} unread)` : ''}`}
      >
        <Bell className="w-5 h-5" />
        {unreadCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 flex items-center justify-center min-w-[18px] h-[18px] px-1 text-xs font-medium text-white bg-primary-500 rounded-full">
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>

      {/* Dropdown */}
      {isOpen && (
        <div className="absolute right-0 mt-2 w-96 bg-swarm-card border border-swarm-border rounded-lg shadow-xl z-50 overflow-hidden">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-swarm-border">
            <h3 className="text-sm font-semibold text-white">Notifications</h3>
            {unreadCount > 0 && (
              <div className="flex items-center gap-2">
                <button
                  onClick={clearNotifications}
                  className="flex items-center gap-1 text-xs text-gray-400 hover:text-white transition-colors"
                  aria-label="Clear all notifications"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Clear all</span>
                </button>
              </div>
            )}
          </div>

          {/* Notifications List */}
          <div className="max-h-[400px] overflow-y-auto">
            {unreadCount === 0 ? (
              <div className="flex flex-col items-center justify-center py-8 text-gray-500">
                <Bell className="w-10 h-10 mb-2 opacity-50" />
                <p className="text-sm">No notifications</p>
                <p className="text-xs mt-1">You're all caught up!</p>
              </div>
            ) : (
              <div className="p-2 space-y-4">
                {Array.from(groupedNotifications.entries()).map(([dateGroup, items]) => (
                  <div key={dateGroup}>
                    <h4 className="text-xs font-medium text-gray-500 uppercase tracking-wider px-2 mb-2">
                      {dateGroup}
                    </h4>
                    <div className="space-y-2">
                      {items.map((notification) => (
                        <NotificationItem
                          key={notification.id}
                          notification={notification}
                          onRemove={removeNotification}
                        />
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Footer */}
          {unreadCount > 0 && (
            <div className="border-t border-swarm-border p-2">
              <button
                onClick={() => setIsOpen(false)}
                className="w-full flex items-center justify-center gap-2 px-4 py-2 text-sm text-gray-400 hover:text-white hover:bg-swarm-dark rounded-lg transition-colors"
              >
                <Check className="w-4 h-4" />
                <span>Mark all as read</span>
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
