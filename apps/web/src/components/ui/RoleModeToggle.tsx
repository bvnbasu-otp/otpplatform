import React from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useRoleContext } from '@/features/roles';
import { useAuth } from '@/features/auth';

interface RoleModeToggleProps {
  className?: string;
  size?: 'sm' | 'md';
  onToggle?: (mode: 'buyer' | 'supplier') => void;
}

export function RoleModeToggle({ className = '', size = 'sm', onToggle }: RoleModeToggleProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAuth();
  const { context, switchTo, switchSide } = useRoleContext();

  const isSupplierPath =
    location.pathname.startsWith('/supplier') ||
    location.search.includes('side=supplier') ||
    context.side === 'SUPPLIER';

  const handleToggle = async (mode: 'buyer' | 'supplier') => {
    onToggle?.(mode);
    if (mode === 'supplier') {
      if (!user) {
        navigate('/signup?side=supplier');
        return;
      }
      if (context.side !== 'SUPPLIER') {
        const res = await switchSide('SUPPLIER');
        if (!res.ok) {
          // Fallback to role switch if holding supplier role
          const supplierRole = context.roles.find((r) => r.side === 'SUPPLIER');
          if (supplierRole && supplierRole.code !== context.activeRole?.code) {
            await switchTo(supplierRole.code);
          }
        }
      }
      navigate('/supplier/purchase-orders');
    } else {
      if (!user) {
        navigate('/');
        return;
      }
      if (context.side !== 'BUYER') {
        const res = await switchSide('BUYER');
        if (!res.ok) {
          // Fallback to role switch if holding buyer role
          const buyerRole = context.roles.find((r) => r.side === 'BUYER');
          if (buyerRole && buyerRole.code !== context.activeRole?.code) {
            await switchTo(buyerRole.code);
          }
        }
      }
      navigate('/dashboard');
    }
  };

  const isSmall = size === 'sm';

  return (
    <div
      className={`inline-flex items-center rounded-full border border-border/80 bg-muted/60 p-0.5 shadow-2xs ${className}`}
      role="group"
      aria-label="Role Mode Switcher"
    >
      <button
        type="button"
        onClick={() => void handleToggle('buyer')}
        className={`flex items-center gap-1 rounded-full font-bold transition-all ${
          !isSupplierPath
            ? 'bg-card text-foreground shadow-xs ring-1 ring-border/60'
            : 'text-muted-foreground hover:text-foreground'
        } ${isSmall ? 'px-2 py-0.5 text-[10px]' : 'px-3 py-1 text-xs'}`}
        aria-pressed={!isSupplierPath}
      >
        <span>🏢</span>
        <span>Buyer Mode</span>
      </button>

      <button
        type="button"
        onClick={() => void handleToggle('supplier')}
        className={`flex items-center gap-1 rounded-full font-bold transition-all ${
          isSupplierPath
            ? 'bg-card text-foreground shadow-xs ring-1 ring-border/60'
            : 'text-muted-foreground hover:text-foreground'
        } ${isSmall ? 'px-2 py-0.5 text-[10px]' : 'px-3 py-1 text-xs'}`}
        aria-pressed={isSupplierPath}
      >
        <span>🚚</span>
        <span>Supplier Mode</span>
      </button>
    </div>
  );
}
