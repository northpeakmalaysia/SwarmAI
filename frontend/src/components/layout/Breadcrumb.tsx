import { Link, useLocation } from 'react-router-dom'
import { Home, ChevronRight } from 'lucide-react'
import { clsx } from 'clsx'

// Route to human-readable label mapping
const routeLabels: Record<string, string> = {
  dashboard: 'Dashboard',
  agents: 'Agents',
  messages: 'Messages',
  flows: 'FlowBuilder',
  knowledge: 'Knowledge',
  swarm: 'Swarm',
  settings: 'Settings',
  profile: 'Profile',
  'ai-settings': 'AI Settings',
  security: 'Security',
  notifications: 'Notifications',
  appearance: 'Appearance',
  billing: 'Billing',
  create: 'Create',
  edit: 'Edit',
  view: 'View',
  new: 'New',
}

interface BreadcrumbItem {
  label: string
  path: string
  isLast: boolean
}

function generateBreadcrumbs(pathname: string): BreadcrumbItem[] {
  // Remove leading slash and split into segments
  const segments = pathname.replace(/^\//, '').split('/').filter(Boolean)

  if (segments.length === 0) {
    return []
  }

  const breadcrumbs: BreadcrumbItem[] = []
  let currentPath = ''

  segments.forEach((segment, index) => {
    currentPath += `/${segment}`
    const isLast = index === segments.length - 1

    // Try to get a human-readable label
    let label = routeLabels[segment.toLowerCase()]

    // If no mapping found, check if it's an ID (UUID or numeric)
    if (!label) {
      const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(segment)
      const isNumeric = /^\d+$/.test(segment)

      if (isUUID || isNumeric) {
        // For IDs, use "Details" or show shortened ID
        label = isUUID ? `#${segment.substring(0, 8)}...` : `#${segment}`
      } else {
        // Capitalize and replace hyphens/underscores with spaces
        label = segment
          .replace(/[-_]/g, ' ')
          .replace(/\b\w/g, (char) => char.toUpperCase())
      }
    }

    breadcrumbs.push({
      label,
      path: currentPath,
      isLast,
    })
  })

  return breadcrumbs
}

interface BreadcrumbProps {
  className?: string
}

export default function Breadcrumb({ className }: BreadcrumbProps) {
  const location = useLocation()
  const breadcrumbs = generateBreadcrumbs(location.pathname)

  // Don't render if we're on the root or dashboard (single level)
  if (breadcrumbs.length <= 1) {
    return null
  }

  return (
    <nav
      aria-label="Breadcrumb"
      className={clsx('flex items-center gap-1 text-sm', className)}
    >
      {/* Home icon link */}
      <Link
        to="/dashboard"
        className="flex items-center justify-center w-8 h-8 rounded-lg text-gray-400 hover:text-white hover:bg-swarm-dark transition-colors"
        aria-label="Home"
      >
        <Home className="w-4 h-4" />
      </Link>

      {breadcrumbs.map((item, index) => (
        <div key={item.path} className="flex items-center gap-1">
          <ChevronRight className="w-4 h-4 text-gray-600" />
          {item.isLast ? (
            <span
              className="px-2 py-1 text-gray-200 font-medium"
              aria-current="page"
            >
              {item.label}
            </span>
          ) : (
            <Link
              to={item.path}
              className="px-2 py-1 text-gray-400 hover:text-white rounded transition-colors"
            >
              {item.label}
            </Link>
          )}
        </div>
      ))}
    </nav>
  )
}
