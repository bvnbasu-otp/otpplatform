import React, { useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Icon } from '@/components/ui/Icon';
import { WizardProgress } from './WizardProgress';

export type PersonaType = 'INDIVIDUAL' | 'RWA' | 'MSME' | 'SUPPLIER';

export interface WizardStep4PersonaProps {
  side: 'BUYER' | 'SUPPLIER';
  onNext: (persona: PersonaType) => void;
  onBack: () => void;
}

export function WizardStep4Persona({ side, onNext, onBack }: WizardStep4PersonaProps) {
  const [selectedPersona, setSelectedPersona] = useState<PersonaType>(
    side === 'BUYER' ? 'INDIVIDUAL' : 'SUPPLIER'
  );

  const buyerPersonas = [
    {
      id: 'INDIVIDUAL' as const,
      title: 'Individual',
      subtitle: 'For personal or home use',
      icon: 'shopping_bag',
    },
    {
      id: 'RWA' as const,
      title: 'RWA / Apartment Assn.',
      subtitle: 'For residential communities',
      icon: 'apartment',
    },
    {
      id: 'MSME' as const,
      title: 'MSME / Business',
      subtitle: 'For small and medium businesses',
      icon: 'business',
    },
  ];

  const supplierPersonas = [
    {
      id: 'SUPPLIER' as const,
      title: 'Supplier / Service Provider',
      subtitle: 'For businesses supplying goods or services',
      icon: 'local_shipping',
    },
  ];

  const list = side === 'BUYER' ? buyerPersonas : supplierPersonas;

  return (
    <div className="flex flex-col min-h-screen bg-background text-foreground justify-between p-4 sm:p-6 max-w-md mx-auto w-full">
      <div>
        <WizardProgress step={4} total={5} label="Choose Persona" onBack={onBack} />

        <div className="space-y-1 mb-6">
          <h2 className="text-xl font-black text-foreground">Choose Your Persona</h2>
          <p className="text-xs text-muted-foreground leading-relaxed">
            This helps us personalise your experience.
          </p>
        </div>

        <div className="space-y-3">
          <label className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground block">
            {side === 'BUYER' ? 'BUYER' : 'SUPPLIER'}
          </label>

          {list.map((item) => {
            const isSelected = selectedPersona === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setSelectedPersona(item.id)}
                className={`w-full text-left rounded-2xl border-2 p-3.5 sm:p-4 transition flex items-center justify-between cursor-pointer ${
                  isSelected
                    ? 'border-primary bg-primary/5 shadow-xs ring-1 ring-primary/30'
                    : 'border-border/80 bg-card hover:border-border hover:bg-muted/30'
                }`}
              >
                <div className="flex items-center gap-3">
                  <div
                    className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
                      isSelected
                        ? 'bg-primary text-primary-foreground'
                        : 'bg-muted text-muted-foreground'
                    }`}
                  >
                    <Icon name={item.icon} size={22} />
                  </div>
                  <div>
                    <h3 className="text-xs sm:text-sm font-bold text-foreground">{item.title}</h3>
                    <p className="text-[11px] text-muted-foreground mt-0.5">{item.subtitle}</p>
                  </div>
                </div>
                <div
                  className={`w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 ${
                    isSelected
                      ? 'border-primary bg-primary text-primary-foreground'
                      : 'border-muted-foreground/40 bg-transparent'
                  }`}
                >
                  {isSelected && <Icon name="check_circle" size={14} />}
                </div>
              </button>
            );
          })}
        </div>
      </div>

      <div className="pt-6 pb-4">
        <Button
          type="button"
          onClick={() => onNext(selectedPersona)}
          className="w-full py-3.5 text-sm font-bold shadow-sm"
        >
          Continue
        </Button>
      </div>
    </div>
  );
}
