/**
 * OTP Next — Contracts Client Context
 * Provides decoupled modular service contracts to the frontend application.
 */

import React, { createContext, useContext, useMemo } from 'react';
import { supabase } from '@/lib/supabase';
import { createOtpNextContracts, type OtpNextContracts } from '@otp/services';

interface ContractsContextValue {
  contracts: OtpNextContracts;
}

const ContractsContext = createContext<ContractsContextValue | null>(null);

export function ContractsProvider({ children }: { children: React.ReactNode }) {
  const contracts = useMemo(() => {
    return createOtpNextContracts(supabase);
  }, []);

  return (
    <ContractsContext.Provider value={{ contracts }}>
      {children}
    </ContractsContext.Provider>
  );
}

export function useContracts(): OtpNextContracts {
  const ctx = useContext(ContractsContext);
  if (!ctx) {
    // Graceful fallback to client instance if called outside provider
    return createOtpNextContracts(supabase);
  }
  return ctx.contracts;
}
