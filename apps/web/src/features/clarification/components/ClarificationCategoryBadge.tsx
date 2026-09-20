import type { ClarificationCategory } from '../api/clarification';

interface ClarificationCategoryBadgeProps {
  category: ClarificationCategory;
  className?: string;
  size?: 'sm' | 'md';
}

const CATEGORY_CONFIG: Record<
  ClarificationCategory,
  { label: string; icon: string; bg: string; text: string; border: string }
> = {
  TECHNICAL_SPEC: {
    label: 'Technical Spec',
    icon: '⚙️',
    bg: 'bg-indigo-50 dark:bg-indigo-950/50',
    text: 'text-indigo-700 dark:text-indigo-300',
    border: 'border-indigo-200 dark:border-indigo-800/60',
  },
  COMMERCIAL_TERMS: {
    label: 'Commercial Terms',
    icon: '💰',
    bg: 'bg-emerald-50 dark:bg-emerald-950/50',
    text: 'text-emerald-700 dark:text-emerald-300',
    border: 'border-emerald-200 dark:border-emerald-800/60',
  },
  DELIVERY_LOGISTICS: {
    label: 'Delivery & Logistics',
    icon: '🚚',
    bg: 'bg-amber-50 dark:bg-amber-950/50',
    text: 'text-amber-700 dark:text-amber-300',
    border: 'border-amber-200 dark:border-amber-800/60',
  },
  COMPLIANCE: {
    label: 'Compliance',
    icon: '📋',
    bg: 'bg-purple-50 dark:bg-purple-950/50',
    text: 'text-purple-700 dark:text-purple-300',
    border: 'border-purple-200 dark:border-purple-800/60',
  },
};

export function ClarificationCategoryBadge({
  category,
  className = '',
  size = 'sm',
}: ClarificationCategoryBadgeProps) {
  const config = CATEGORY_CONFIG[category] || CATEGORY_CONFIG.TECHNICAL_SPEC;

  const sizeClasses =
    size === 'md'
      ? 'px-2.5 py-1 text-xs gap-1.5'
      : 'px-2 py-0.5 text-[10px] gap-1';

  return (
    <span
      className={`inline-flex items-center font-bold rounded-full border ${config.bg} ${config.text} ${config.border} ${sizeClasses} ${className}`}
      title={config.label}
    >
      <span aria-hidden="true">{config.icon}</span>
      <span>{config.label}</span>
    </span>
  );
}
