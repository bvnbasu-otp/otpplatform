import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { WizardStep1Welcome } from './WizardStep1Welcome';
import { WizardStep2Contact } from './WizardStep2Contact';
import { WizardStep3AccountType } from './WizardStep3AccountType';
import { WizardStep4Persona, type PersonaType } from './WizardStep4Persona';
import { WizardStep5Individual } from './WizardStep5Individual';
import { WizardStep5RWA } from './WizardStep5RWA';
import { WizardStep5MSME } from './WizardStep5MSME';
import { WizardStep5Supplier } from './WizardStep5Supplier';
import { SignupSuccess } from '../SignupSuccess';
import { copyFor } from '../../types/portal';
import type { SignupResult, VerificationChannel } from '../../api/signup';

export interface X2ORegistrationWizardProps {
  onSuccess?: (result: SignupResult) => void;
  onSignIn?: () => void;
}

export function X2ORegistrationWizard({ onSuccess, onSignIn }: X2ORegistrationWizardProps) {
  const navigate = useNavigate();
  const [currentStep, setCurrentStep] = useState<number>(1);
  const [channel, setChannel] = useState<VerificationChannel>('WHATSAPP');
  const [primaryIdentifier, setPrimaryIdentifier] = useState<string>('');
  const [secondaryEmail, setSecondaryEmail] = useState<string | undefined>();
  const [secondaryPhone, setSecondaryPhone] = useState<string | undefined>();
  const [side, setSide] = useState<'BUYER' | 'SUPPLIER'>('BUYER');
  const [persona, setPersona] = useState<PersonaType>('INDIVIDUAL');
  const [submittedResult, setSubmittedResult] = useState<SignupResult | null>(null);

  function handleStep1Verified(selectedChannel: VerificationChannel, identifier: string) {
    setChannel(selectedChannel);
    setPrimaryIdentifier(identifier);
    setCurrentStep(2);
  }

  function handleStep2Contact(secEmail?: string, secPhone?: string) {
    setSecondaryEmail(secEmail);
    setSecondaryPhone(secPhone);
    setCurrentStep(3);
  }

  function handleStep3AccountType(selectedSide: 'BUYER' | 'SUPPLIER') {
    setSide(selectedSide);
    if (selectedSide === 'SUPPLIER') {
      setPersona('SUPPLIER');
    } else if (persona === 'SUPPLIER') {
      setPersona('INDIVIDUAL');
    }
    setCurrentStep(4);
  }

  function handleStep4Persona(selectedPersona: PersonaType) {
    setPersona(selectedPersona);
    setCurrentStep(5);
  }

  function handleFinalSuccess(result: SignupResult) {
    setSubmittedResult(result);
    if (onSuccess) {
      onSuccess(result);
    }
  }

  function handleDefaultSignIn() {
    if (onSignIn) {
      onSignIn();
    } else {
      navigate('/login');
    }
  }

  if (submittedResult) {
    const copy = copyFor(side);
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center p-4">
        <div className="w-full max-w-md bg-card border border-border rounded-2xl p-6 shadow-sm">
          <SignupSuccess
            copy={copy}
            result={submittedResult}
            onSignIn={handleDefaultSignIn}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col justify-center sm:py-6">
      <div className="w-full max-w-md mx-auto bg-card sm:border sm:border-border sm:rounded-3xl sm:shadow-sm overflow-hidden flex flex-col min-h-screen sm:min-h-0">
        {currentStep === 1 && (
          <WizardStep1Welcome onVerified={handleStep1Verified} />
        )}

        {currentStep === 2 && (
          <WizardStep2Contact
            primaryChannel={channel}
            primaryIdentifier={primaryIdentifier}
            onNext={handleStep2Contact}
            onBack={() => setCurrentStep(1)}
          />
        )}

        {currentStep === 3 && (
          <WizardStep3AccountType
            onNext={handleStep3AccountType}
            onBack={() => setCurrentStep(2)}
          />
        )}

        {currentStep === 4 && (
          <WizardStep4Persona
            side={side}
            onNext={handleStep4Persona}
            onBack={() => setCurrentStep(3)}
          />
        )}

        {currentStep === 5 && persona === 'INDIVIDUAL' && (
          <WizardStep5Individual
            primaryChannel={channel}
            primaryIdentifier={primaryIdentifier}
            secondaryEmail={secondaryEmail}
            secondaryPhone={secondaryPhone}
            onSuccess={handleFinalSuccess}
            onBack={() => setCurrentStep(4)}
          />
        )}

        {currentStep === 5 && persona === 'RWA' && (
          <WizardStep5RWA
            primaryChannel={channel}
            primaryIdentifier={primaryIdentifier}
            secondaryEmail={secondaryEmail}
            secondaryPhone={secondaryPhone}
            onSuccess={handleFinalSuccess}
            onBack={() => setCurrentStep(4)}
          />
        )}

        {currentStep === 5 && persona === 'MSME' && (
          <WizardStep5MSME
            primaryChannel={channel}
            primaryIdentifier={primaryIdentifier}
            secondaryEmail={secondaryEmail}
            secondaryPhone={secondaryPhone}
            onSuccess={handleFinalSuccess}
            onBack={() => setCurrentStep(4)}
          />
        )}

        {currentStep === 5 && persona === 'SUPPLIER' && (
          <WizardStep5Supplier
            primaryChannel={channel}
            primaryIdentifier={primaryIdentifier}
            secondaryEmail={secondaryEmail}
            secondaryPhone={secondaryPhone}
            onSuccess={handleFinalSuccess}
            onBack={() => setCurrentStep(4)}
          />
        )}
      </div>
    </div>
  );
}
