import { cva, type VariantProps } from 'class-variance-authority';
import type { ButtonHTMLAttributes } from 'react';
import { cn } from '../lib/cn';

const button = cva(
  'tool-button inline-flex shrink-0 items-center justify-center select-none transition-colors',
  {
    variants: {
      active: { true: 'is-active', false: '' },
      size: { icon: 'icon-button', menu: 'menu-item' },
    },
    defaultVariants: { active: false, size: 'icon' },
  },
);

type Props = ButtonHTMLAttributes<HTMLButtonElement> & VariantProps<typeof button>;
export function Button({ active, size, className, children, ...props }: Props) {
  return (
    <button type="button" className={cn(button({ active, size }), className)} {...props}>
      {children}
    </button>
  );
}
