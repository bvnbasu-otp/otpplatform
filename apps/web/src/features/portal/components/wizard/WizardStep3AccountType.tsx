import React, { useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Icon } from '@/components/ui/Icon';
import { WizardProgress } from './WizardProgress';

export interface WizardStep3AccountTypeProps {
  onNext: (side: 'BUYER' | 'SUPPLIER') => void;
  onBack: () => void;
}

export function WizardStep3AccountType({ onNext, onBack }: WizardStep3AccountTypeProps) {
  const [selectedSide, setSelectedSide] = useState<'BUYER' | 'SUPPLIER'>('BUYER');

  return (
    <div className="flex flex-col min-h-screen bg-background text-foreground justify-between p-4 sm:p-6 max-w-md mx-auto w-full">
      <div>
        <WizardProgress step={3} total={5} label="Account Type" onBack={onBack} />

        <div className="space-y-1 mb-6">
          <h2 className="text-xl font-black text-foreground">What do you want to do?</h2>
          <p className="text-xs text-muted-foreground leading-relaxed">
            Select your account type.
          </p>
        </div>

        <div className="space-y-3.5">
          {/* Buyer Card */}
          <button
            type="button"
            onClick={() => setSelectedSide('BUYER')}
            className={`w-full text-left rounded-2xl border-2 p-4 transition flex items-center justify-between cursor-pointer ${
              selectedSide === 'BUYER'
                ? 'border-primary bg-primary/5 shadow-xs ring-1 ring-primary/30'
                : 'border-border/80 bg-card hover:border-border hover:bg-muted/30'
            }`}
          >
            <div className="flex items-center gap-3.5">
              <div
                className={`w-12 h-12 rounded-xl flex items-center justify-center shrink-0 ${
                  selectedSide === 'BUYER'
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-muted text-muted-foreground'
                }`}
              >
                <Icon name="shopping_bag" size={24} />
              </div>
              <div>
                <h3 className="text-sm font-bold text-foreground">Buyer</h3>
                <p className="text-xs text-muted-foreground mt-0.5">
                  I want to purchase goods or services.
                </p>
              </div>
            </div>
            <div
              className={`w-6 h-6 rounded-full border-2 flex items-center justify-center shrink-0 ${
                selectedSide === 'BUYER'
                  ? 'border-primary bg-primary text-primary-foreground'
                  : 'border-muted-foreground/40 bg-transparent'
              }`}
            >
              {selectedSide === 'BUYER' && <Icon name="check_circle" size={16} />}
            </div>
          </button>

          {/* Supplier Card */}
          <button
            type="button"
            onClick={() => setSelectedSide('SUPPLIER')}
            className={`w-full text-left rounded-2xl border-2 p-4 transition flex items-center justify-between cursor-pointer ${
              selectedSide === 'SUPPLIER'
                ? 'border-primary bg-primary/5 shadow-xs ring-1 ring-primary/30'
                : 'border-border/80 bg-card hover:border-border hover:bg-muted/30'
            }`}
          >
            <div className="flex items-center gap-3.5">
              <div
                className={`w-12 h-12 rounded-xl flex items-center justify-center shrink-0 ${
                  selectedSide === 'SUPPLIER'
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-muted text-muted-foreground'
                }`}
              >
                <Icon name="local_shipping" size={24} />
              </div>
              <div>
                <h3 className="text-sm font-bold text-foreground">Supplier</h3>
                <p className="text-xs text-muted-foreground mt-0.5">
                  I want to sell products or provide services.
                </p>
              </div>
            </div>
            <div
              className={`w-6 h-6 rounded-full border-2 flex items-center justify-center shrink-0 ${
                selectedSide === 'SUPPLIER'
                  ? 'border-primary bg-primary text-primary-foreground'
                  : 'border-muted-foreground/40 bg-transparent'
              }`}
            >
              {selectedSide === 'SUPPLIER' && <Icon name="check_circle" size={16} />}
            </div>
          </button>

          {/* Dual-role Note */}
          <div className="rounded-xl bg-muted/40 border border-border/60 p-3 flex items-start gap-2.5 text-xs text-muted-foreground leading-relaxed mt-4">
            <Icon name="verified" size={16} className="text-primary shrink-0 mt-0.5" />
            <p className="text-[11px]">
              One account, one identity. You can activate another role later — no duplicate registration.
            </p>
          </div>
        </div>
      </div>

      <div className="pt-6 pb-4">
        <Button
          type="button"
          onClick={() => onNext(selectedSide)}
          className="w-full py-3.5 text-sm font-bold shadow-sm"
        >
          Continue
        </Button>
      </div>
    </div>
  );
}
