/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        primary: {
          50: '#f0f9ff',
          100: '#e0f2fe',
          200: '#bae6fd',
          300: '#7dd3fc',
          400: '#38bdf8',
          500: '#0ea5e9',
          600: '#0284c7',
          700: '#0369a1',
          800: '#075985',
          900: '#0c4a6e',
          950: '#082f49',
        },
        swarm: {
          primary: '#0ea5e9',
          secondary: '#8b5cf6',
          accent: '#ec4899',
          dark: '#0f172a',
          darker: '#020617',
          card: '#1e293b',
          border: '#334155',
          glow: '#818cf8',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'Fira Code', 'monospace'],
      },
      boxShadow: {
        // Neumorphism - Raised/Extruded effect (default cards)
        'neu-raised': '-6px -6px 14px rgba(255,255,255,0.03), 6px 6px 14px rgba(0,0,0,0.5), inset 1px 1px 1px rgba(255,255,255,0.03)',
        'neu-raised-sm': '-3px -3px 8px rgba(255,255,255,0.03), 3px 3px 8px rgba(0,0,0,0.4)',
        // Neumorphism - Pressed/Inset effect (for active states, inputs)
        'neu-pressed': 'inset -4px -4px 10px rgba(255,255,255,0.03), inset 4px 4px 10px rgba(0,0,0,0.5)',
        'neu-pressed-sm': 'inset -2px -2px 6px rgba(255,255,255,0.03), inset 2px 2px 6px rgba(0,0,0,0.4)',
        // Neumorphism Pressed + Colored Inner Glow
        'neu-pressed-glow': 'inset -4px -4px 10px rgba(255,255,255,0.03), inset 4px 4px 10px rgba(0,0,0,0.5), inset 0 0 30px rgba(14,165,233,0.15)',
        'neu-pressed-glow-emerald': 'inset -4px -4px 10px rgba(255,255,255,0.03), inset 4px 4px 10px rgba(0,0,0,0.5), inset 0 0 30px rgba(16,185,129,0.15)',
        'neu-pressed-glow-amber': 'inset -4px -4px 10px rgba(255,255,255,0.03), inset 4px 4px 10px rgba(0,0,0,0.5), inset 0 0 30px rgba(245,158,11,0.15)',
        'neu-pressed-glow-purple': 'inset -4px -4px 10px rgba(255,255,255,0.03), inset 4px 4px 10px rgba(0,0,0,0.5), inset 0 0 30px rgba(139,92,246,0.15)',
        'neu-pressed-glow-rose': 'inset -4px -4px 10px rgba(255,255,255,0.03), inset 4px 4px 10px rgba(0,0,0,0.5), inset 0 0 30px rgba(244,63,94,0.15)',
        // Neumorphism - Flat with subtle depth
        'neu-flat': '0 1px 2px rgba(0,0,0,0.3), inset 0 1px 0 rgba(255,255,255,0.04)',
        // Combined - Raised with inner highlight
        'neu-card': '-5px -5px 12px rgba(255,255,255,0.025), 5px 5px 12px rgba(0,0,0,0.45), inset 0 1px 0 rgba(255,255,255,0.05)',
        // Legacy inset (keeping for compatibility)
        'inset-card': 'inset 0 1px 0 0 rgba(255,255,255,0.05), inset 0 0 20px rgba(0,0,0,0.3)',
        'inset-glow': 'inset 0 0 20px rgba(14,165,233,0.1), 0 0 20px rgba(14,165,233,0.1)',
        // Glow effects
        'card-glow': '0 0 30px rgba(14,165,233,0.15)',
        'card-glow-emerald': '0 0 20px rgba(16,185,129,0.2)',
        'card-glow-amber': '0 0 20px rgba(245,158,11,0.2)',
        'card-glow-rose': '0 0 20px rgba(244,63,94,0.2)',
        'card-glow-purple': '0 0 20px rgba(139,92,246,0.2)',
        // Neumorphism + Glow combinations
        'neu-glow': '-5px -5px 12px rgba(255,255,255,0.025), 5px 5px 12px rgba(0,0,0,0.45), 0 0 20px rgba(14,165,233,0.1)',
        'neu-glow-emerald': '-5px -5px 12px rgba(255,255,255,0.025), 5px 5px 12px rgba(0,0,0,0.45), 0 0 15px rgba(16,185,129,0.15)',
        'neu-glow-amber': '-5px -5px 12px rgba(255,255,255,0.025), 5px 5px 12px rgba(0,0,0,0.45), 0 0 15px rgba(245,158,11,0.15)',
        'neu-glow-purple': '-5px -5px 12px rgba(255,255,255,0.025), 5px 5px 12px rgba(0,0,0,0.45), 0 0 15px rgba(139,92,246,0.15)',
      },
      animation: {
        'pulse-slow': 'pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'pulse-ring': 'pulse-ring 1.5s infinite',
        'float': 'float 6s ease-in-out infinite',
        'glow': 'glow 2s ease-in-out infinite alternate',
        'gradient-shift': 'gradient-shift 8s ease infinite',
        'flow-dash': 'flow-dash 0.6s linear infinite',
      },
      keyframes: {
        float: {
          '0%, 100%': { transform: 'translateY(0)' },
          '50%': { transform: 'translateY(-10px)' },
        },
        glow: {
          '0%': { boxShadow: '0 0 5px rgba(99, 102, 241, 0.5)' },
          '100%': { boxShadow: '0 0 20px rgba(99, 102, 241, 0.8)' },
        },
        'pulse-ring': {
          '0%': { transform: 'scale(0.8)', opacity: '1' },
          '100%': { transform: 'scale(1.4)', opacity: '0' },
        },
        'gradient-shift': {
          '0%': { backgroundPosition: '0% 50%' },
          '50%': { backgroundPosition: '100% 50%' },
          '100%': { backgroundPosition: '0% 50%' },
        },
        'flow-dash': {
          '0%': { strokeDashoffset: '12' },
          '100%': { strokeDashoffset: '-12' },
        },
      },
    },
  },
  plugins: [],
}
