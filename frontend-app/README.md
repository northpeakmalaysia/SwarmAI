# Frontend App

A modern React SPA built with Vite, React 18, TypeScript, Tailwind CSS, and shadcn/ui.

## Tech Stack

- **Build Tool:** Vite 6
- **Framework:** React 18 + TypeScript
- **Styling:** Tailwind CSS 4
- **Routing:** React Router DOM 7
- **State Management:** React Query (TanStack Query) 5
- **UI Utilities:** class-variance-authority, clsx, tailwind-merge

## Getting Started

### Prerequisites

- Node.js 18+ (LTS recommended)
- npm or yarn

### Installation

```bash
# Clone the repository and navigate into it
cd frontend-app

# Install dependencies
npm install

# Start the dev server
npm run dev
```

The dev server will start at `http://localhost:5173` (or the next available port).

### Build for Production

```bash
npm run build
```

The output will be in the `dist/` folder.

### Preview Production Build

```bash
npm run preview
```

### Lint

```bash
npm run lint
```

## Environment Variables

Copy `.env.example` to `.env` and update the values:

| Variable | Description | Default |
|----------|-------------|---------|
| `VITE_API_BASE_URL` | Backend API base URL | `http://localhost:3000/api` |

## Project Structure

```
src/
  components/    # Reusable UI components
  hooks/         # Custom React hooks
  lib/           # Utility functions (cn, etc.)
  pages/         # Route-level page components
  services/      # API clients and external services
  stores/        # State stores (React Context / Zustand)
  types/         # Shared TypeScript types
  App.tsx        # Root component with routes
  main.tsx       # Entry point
  index.css      # Global styles + Tailwind imports
```

## License

MIT
