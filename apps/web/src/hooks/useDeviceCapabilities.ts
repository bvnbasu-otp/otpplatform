import { useState, useCallback } from 'react';

export interface DeviceLocationResult {
  latitude: number;
  longitude: number;
  city?: string;
  error?: string;
}

export function useDeviceCapabilities() {
  const [isLocating, setIsLocating] = useState(false);
  const [locationError, setLocationError] = useState<string | null>(null);

  const requestCurrentLocation = useCallback(async (): Promise<DeviceLocationResult | null> => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      setLocationError('Geolocation is not supported by your browser.');
      return null;
    }

    setIsLocating(true);
    setLocationError(null);

    return new Promise((resolve) => {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          setIsLocating(false);
          resolve({
            latitude: position.coords.latitude,
            longitude: position.coords.longitude,
          });
        },
        (error) => {
          setIsLocating(false);
          let msg = 'Unable to retrieve location.';
          if (error.code === error.PERMISSION_DENIED) {
            msg = 'Location permission denied by user.';
          } else if (error.code === error.POSITION_UNAVAILABLE) {
            msg = 'Location information is unavailable.';
          } else if (error.code === error.TIMEOUT) {
            msg = 'Location request timed out.';
          }
          setLocationError(msg);
          resolve({
            latitude: 0,
            longitude: 0,
            error: msg,
          });
        },
        { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 }
      );
    });
  }, []);

  const copyToClipboard = useCallback(async (text: string): Promise<boolean> => {
    if (typeof navigator === 'undefined' || !navigator.clipboard) {
      return false;
    }
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      return false;
    }
  }, []);

  return {
    isLocating,
    locationError,
    requestCurrentLocation,
    copyToClipboard,
  };
}
