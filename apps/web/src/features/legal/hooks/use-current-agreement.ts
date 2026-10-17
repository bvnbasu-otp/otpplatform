import { useEffect, useState } from 'react';
import {
  agreementTypeForSide,
  fetchCurrentAgreement,
  fetchLegalSnapshotText,
  type CurrentAgreement,
} from '../api/legal-acceptance';

export type LoadedAgreement = CurrentAgreement & {
  snapshotPublished: boolean;
  bodyText: string | null;
};

export type CurrentAgreementState =
  | { phase: 'loading' }
  | { phase: 'ready'; agreement: LoadedAgreement }
  | { phase: 'error'; message: string };

/** Loads the agreement the server will accept for this registration side. */
export function useCurrentAgreement(side: 'BUYER' | 'SUPPLIER'): CurrentAgreementState & { reload: () => void } {
  const [state, setState] = useState<CurrentAgreementState>({ phase: 'loading' });
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setState({ phase: 'loading' });
    const agreementType = agreementTypeForSide(side);
    void Promise.all([
      fetchCurrentAgreement(agreementType),
      fetchLegalSnapshotText(agreementType),
    ]).then(([agreement, snapshot]) => {
      if (cancelled) return;
      if (!agreement.ok) {
        setState({ phase: 'error', message: agreement.error });
        return;
      }
      if (!snapshot.ok) {
        setState({ phase: 'error', message: snapshot.error });
        return;
      }
      if (
        snapshot.value.published
        && (snapshot.value.version !== agreement.value.version
          || snapshot.value.documentHash !== agreement.value.documentHash)
      ) {
        setState({ phase: 'error', message: 'The published agreement does not match its frozen text.' });
        return;
      }
      setState({
        phase: 'ready',
        agreement: {
          ...agreement.value,
          snapshotPublished: snapshot.value.published,
          bodyText: snapshot.value.bodyText,
        },
      });
    });
    return () => {
      cancelled = true;
    };
  }, [side, nonce]);

  return { ...state, reload: () => setNonce((n) => n + 1) };
}
