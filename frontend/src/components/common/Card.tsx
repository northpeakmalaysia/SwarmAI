import React, { forwardRef } from 'react';
import { cn } from '../../lib/utils';

export type CardVariant = 'default' | 'bordered' | 'interactive' | 'pressed' | 'pressed-glow';

export interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Card visual variant */
  variant?: CardVariant;
  /** Disable default padding */
  noPadding?: boolean;
  /** Glow color for pressed-glow variant */
  glowColor?: 'default' | 'emerald' | 'amber' | 'purple' | 'rose' | 'sky';
}

export interface CardHeaderProps extends Omit<React.HTMLAttributes<HTMLDivElement>, 'title'> {
  /** Header title */
  title?: React.ReactNode;
  /** Header subtitle */
  subtitle?: React.ReactNode;
  /** Action element (buttons, icons) to render on the right */
  action?: React.ReactNode;
}

export interface CardBodyProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Disable default padding */
  noPadding?: boolean;
}

export interface CardFooterProps extends React.HTMLAttributes<HTMLDivElement> {}

const variantStyles: Record<CardVariant, string> = {
  default: 'bg-slate-800 border border-slate-700',
  bordered: 'bg-slate-800/50 border-2 border-slate-600',
  interactive: 'bg-slate-800 border border-slate-700 hover:border-sky-500/50 hover:shadow-lg hover:shadow-sky-500/10 cursor-pointer transition-all duration-200',
  pressed: 'bg-swarm-dark border border-swarm-border/30 shadow-neu-pressed transition-all duration-300',
  'pressed-glow': 'bg-swarm-dark border border-swarm-border/30 shadow-neu-pressed transition-all duration-300',
};

const glowStyles: Record<string, string> = {
  default: 'hover:shadow-neu-pressed-glow',
  emerald: 'hover:shadow-neu-pressed-glow-emerald',
  amber: 'hover:shadow-neu-pressed-glow-amber',
  purple: 'hover:shadow-neu-pressed-glow-purple',
  rose: 'hover:shadow-neu-pressed-glow-rose',
  sky: 'hover:shadow-neu-pressed-glow',
};

/**
 * Card component with header, body, and footer sections.
 *
 * @example
 * ```tsx
 * <Card variant="interactive">
 *   <Card.Header
 *     title="Agent Status"
 *     subtitle="Last updated 2 minutes ago"
 *     action={<Button size="sm" variant="ghost" icon={<MoreVertical />} />}
 *   />
 *   <Card.Body>
 *     <p>Card content here</p>
 *   </Card.Body>
 *   <Card.Footer>
 *     <Button variant="primary">View Details</Button>
 *   </Card.Footer>
 * </Card>
 * ```
 */
export const Card = forwardRef<HTMLDivElement, CardProps>(
  ({ variant = 'default', noPadding = false, glowColor = 'default', className, children, ...props }, ref) => {
    const isGlowVariant = variant === 'pressed-glow';
    return (
      <div
        ref={ref}
        className={cn(
          'rounded-2xl',
          variantStyles[variant],
          isGlowVariant && glowStyles[glowColor],
          !noPadding && 'p-4',
          className
        )}
        {...props}
      >
        {children}
      </div>
    );
  }
);

Card.displayName = 'Card';

/**
 * Card header section with optional title, subtitle, and action.
 */
export const CardHeader = forwardRef<HTMLDivElement, CardHeaderProps>(
  ({ title, subtitle, action, className, children, ...props }, ref) => {
    return (
      <div
        ref={ref}
        className={cn('flex items-start justify-between mb-4', className)}
        {...props}
      >
        {(title || subtitle) ? (
          <div className="flex-1 min-w-0">
            {title && (
              <h3 className="text-base font-semibold text-white truncate">
                {title}
              </h3>
            )}
            {subtitle && (
              <p className="text-sm text-gray-400 mt-0.5 truncate">
                {subtitle}
              </p>
            )}
          </div>
        ) : children}
        {action && (
          <div className="flex-shrink-0 ml-4">
            {action}
          </div>
        )}
      </div>
    );
  }
);

CardHeader.displayName = 'CardHeader';

/**
 * Card body section for main content.
 */
export const CardBody = forwardRef<HTMLDivElement, CardBodyProps>(
  ({ noPadding = false, className, children, ...props }, ref) => {
    return (
      <div
        ref={ref}
        className={cn(!noPadding && 'py-2', className)}
        {...props}
      >
        {children}
      </div>
    );
  }
);

CardBody.displayName = 'CardBody';

/**
 * Card footer section for actions.
 */
export const CardFooter = forwardRef<HTMLDivElement, CardFooterProps>(
  ({ className, children, ...props }, ref) => {
    return (
      <div
        ref={ref}
        className={cn(
          'mt-4 pt-3 border-t border-swarm-border/30 flex items-center gap-2',
          className
        )}
        {...props}
      >
        {children}
      </div>
    );
  }
);

CardFooter.displayName = 'CardFooter';

// Attach sub-components to Card
type CardWithSubComponents = typeof Card & {
  Header: typeof CardHeader;
  Body: typeof CardBody;
  Footer: typeof CardFooter;
};

const CardComponent = Card as CardWithSubComponents;
CardComponent.Header = CardHeader;
CardComponent.Body = CardBody;
CardComponent.Footer = CardFooter;

export default CardComponent;
