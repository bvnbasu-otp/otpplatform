import { useEffect, useState } from 'react';
import {
  agreementTypeForSide,
  fetchCurrentAgreement,
  type CurrentAgreement,
} from '../api/legal-acceptance';

export type CurrentAgreementState =
  | { phase: 'loading' }
  | { phase: 'ready'; agreement: CurrentAgreement }
  | { phase: 'error'; message: string };

/** Loads the agreement the server will accept for this registration side. */
export function useCurrentAgreement(side: 'BUYER' | 'SUPPLIER'): CurrentAgreementState & { reload: () => void } {
  const [state, setState] = useState<CurrentAgreementState>({ phase: 'loading' });
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setState({ phase: 'loading' });
    void fetchCurrentAgreement(agreementTypeForSide(side)).then((result) => {
      if (cancelled) return;
      setState(
        result.ok
          ? { phase: 'ready', agreement: result.value }
          : { phase: 'error', message: result.error },
      );
    });
    return () => {
      cancelled = true;
    };
  }, [side, nonce]);

  return { ...state, reload: () => setNonce((n) => n + 1) };
}
