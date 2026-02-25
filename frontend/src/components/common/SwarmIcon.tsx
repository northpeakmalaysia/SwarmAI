interface SwarmIconProps {
  className?: string
  size?: number
}

export default function SwarmIcon({ className = '', size = 24 }: SwarmIconProps) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 100 100"
      width={size}
      height={size}
      className={className}
    >
      <defs>
        <linearGradient id="swarmBodyGrad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" style={{ stopColor: '#1e3a5f', stopOpacity: 1 }} />
          <stop offset="100%" style={{ stopColor: '#0d2137', stopOpacity: 1 }} />
        </linearGradient>
        <linearGradient id="swarmGlowGrad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" style={{ stopColor: '#00d4ff', stopOpacity: 1 }} />
          <stop offset="100%" style={{ stopColor: '#0891b2', stopOpacity: 1 }} />
        </linearGradient>
        <linearGradient id="swarmWingGrad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" style={{ stopColor: '#1e3a5f', stopOpacity: 1 }} />
          <stop offset="100%" style={{ stopColor: '#0f2942', stopOpacity: 1 }} />
        </linearGradient>
      </defs>

      {/* Left Wing */}
      <ellipse cx="25" cy="40" rx="20" ry="12" fill="url(#swarmWingGrad)" stroke="#4a90a4" strokeWidth="1"/>
      {/* Wing circuits left */}
      <path d="M10 40 L25 40 M15 36 L25 36 M15 44 L25 44" stroke="#00d4ff" strokeWidth="1" opacity="0.7"/>
      <circle cx="12" cy="40" r="2" fill="#00d4ff" opacity="0.8"/>
      <circle cx="15" cy="36" r="1.5" fill="#00d4ff" opacity="0.6"/>
      <circle cx="15" cy="44" r="1.5" fill="#00d4ff" opacity="0.6"/>

      {/* Right Wing */}
      <ellipse cx="75" cy="40" rx="20" ry="12" fill="url(#swarmWingGrad)" stroke="#4a90a4" strokeWidth="1"/>
      {/* Wing circuits right */}
      <path d="M90 40 L75 40 M85 36 L75 36 M85 44 L75 44" stroke="#00d4ff" strokeWidth="1" opacity="0.7"/>
      <circle cx="88" cy="40" r="2" fill="#00d4ff" opacity="0.8"/>
      <circle cx="85" cy="36" r="1.5" fill="#00d4ff" opacity="0.6"/>
      <circle cx="85" cy="44" r="1.5" fill="#00d4ff" opacity="0.6"/>

      {/* Head */}
      <ellipse cx="50" cy="25" rx="10" ry="8" fill="url(#swarmBodyGrad)" stroke="#4a90a4" strokeWidth="1"/>
      {/* Antennae */}
      <path d="M43 18 L38 10" stroke="#4a90a4" strokeWidth="2" strokeLinecap="round"/>
      <path d="M57 18 L62 10" stroke="#4a90a4" strokeWidth="2" strokeLinecap="round"/>

      {/* Thorax (center body) */}
      <ellipse cx="50" cy="45" rx="12" ry="10" fill="url(#swarmBodyGrad)" stroke="#4a90a4" strokeWidth="1"/>

      {/* Central glow core */}
      <circle cx="50" cy="45" r="6" fill="url(#swarmGlowGrad)"/>
      <circle cx="50" cy="45" r="3" fill="#ffffff" opacity="0.8"/>

      {/* Abdomen with stripes */}
      <ellipse cx="50" cy="72" rx="14" ry="18" fill="url(#swarmBodyGrad)" stroke="#4a90a4" strokeWidth="1"/>
      {/* Stripes */}
      <path d="M38 65 Q50 62 62 65" stroke="#4a90a4" strokeWidth="2" fill="none"/>
      <path d="M36 72 Q50 69 64 72" stroke="#4a90a4" strokeWidth="2" fill="none"/>
      <path d="M38 79 Q50 76 62 79" stroke="#4a90a4" strokeWidth="2" fill="none"/>
    </svg>
  )
}
