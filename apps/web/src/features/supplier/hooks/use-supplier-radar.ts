import { useState, useEffect, useCallback } from 'react';
import type {
  SupplierCapabilityProfile,
  SupplierRadarMatchBreakdown,
} from '../types/capability-profile';
import {
  loadSupplierCapabilityProfile,
  saveSupplierCapabilityProfile,
  calculateRfqMatchScore,
  capabilityVisibilityScore,
  SUPPLIER_CAPABILITIES_UPDATED_EVENT,
  type RfqMatchTarget,
} from '../lib/supplier-radar-state';

export function useSupplierRadarCapabilities() {
  const [profile, setProfile] = useState<SupplierCapabilityProfile>(() =>
    loadSupplierCapabilityProfile(),
  );

  useEffect(() => {
    const handleUpdate = (event: Event) => {
      const customEvent = event as CustomEvent<SupplierCapabilityProfile>;
      if (customEvent.detail) {
        setProfile(customEvent.detail);
      } else {
        setProfile(loadSupplierCapabilityProfile());
      }
    };

    const handleStorage = (e: StorageEvent) => {
      if (e.key === 'otp_supplier_capability_profile_v1') {
        setProfile(loadSupplierCapabilityProfile());
      }
    };

    window.addEventListener(SUPPLIER_CAPABILITIES_UPDATED_EVENT, handleUpdate);
    window.addEventListener('storage', handleStorage);
    return () => {
      window.removeEventListener(SUPPLIER_CAPABILITIES_UPDATED_EVENT, handleUpdate);
      window.removeEventListener('storage', handleStorage);
    };
  }, []);

  const updateProfile = useCallback((nextProfile: SupplierCapabilityProfile) => {
    const saved = saveSupplierCapabilityProfile(nextProfile);
    setProfile(saved);
    return saved;
  }, []);

  const getMatchScore = useCallback(
    (rfq: RfqMatchTarget): SupplierRadarMatchBreakdown => {
      return calculateRfqMatchScore(profile, rfq);
    },
    [profile],
  );

  const visibilityScore = capabilityVisibilityScore(profile);

  return {
    profile,
    updateProfile,
    getMatchScore,
    visibilityScore,
  };
}
