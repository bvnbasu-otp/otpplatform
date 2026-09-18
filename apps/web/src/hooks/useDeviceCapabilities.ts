import { useState, useCallback, useEffect } from 'react';

export interface DeviceLocationResult {
  latitude: number;
  longitude: number;
  city?: string;
  error?: string;
}

export type DevicePermissionName = 'geolocation' | 'camera' | 'microphone' | 'notifications';
export type DevicePermissionState = 'granted' | 'denied' | 'prompt' | 'unsupported';

export interface MediaStreamResult {
  stream: MediaStream | null;
  error: string | null;
  stop: () => void;
}

export interface ShareDataPayload {
  title: string;
  text?: string;
  url?: string;
}

export interface NetworkConnectionInfo {
  isOnline: boolean;
  effectiveType?: string;
  downlink?: number;
  rtt?: number;
  saveData?: boolean;
}

// ============================================================================
// PURE CAPABILITY RUNTIMES (Directly unit testable without DOM rendering overhead)
// ============================================================================

export async function queryDeviceLocation(
  nav?: Navigator
): Promise<DeviceLocationResult> {
  const targetNav = nav ?? (typeof navigator !== 'undefined' ? navigator : undefined);

  if (!targetNav || !targetNav.geolocation) {
    return {
      latitude: 0,
      longitude: 0,
      error: 'Geolocation is not supported by your browser.',
    };
  }

  return new Promise((resolve) => {
    targetNav.geolocation.getCurrentPosition(
      (position) => {
        resolve({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
        });
      },
      (error) => {
        let msg = 'Unable to retrieve location.';
        if (error.code === error.PERMISSION_DENIED) {
          msg = 'Location permission denied by user.';
        } else if (error.code === error.POSITION_UNAVAILABLE) {
          msg = 'Location information is unavailable.';
        } else if (error.code === error.TIMEOUT) {
          msg = 'Location request timed out.';
        }
        resolve({
          latitude: 0,
          longitude: 0,
          error: msg,
        });
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 }
    );
  });
}

export async function queryDevicePermission(
  permission: DevicePermissionName,
  nav?: Navigator,
  win?: Window
): Promise<DevicePermissionState> {
  const targetNav = nav ?? (typeof navigator !== 'undefined' ? navigator : undefined);
  const targetWin = win ?? (typeof window !== 'undefined' ? window : undefined);

  if (permission === 'notifications') {
    if (!targetWin || !('Notification' in targetWin)) return 'unsupported';
    return (targetWin as any).Notification.permission as DevicePermissionState;
  }

  if (!targetNav || !targetNav.permissions) {
    return 'unsupported';
  }

  try {
    const status = await targetNav.permissions.query({ name: permission as any });
    return status.state as DevicePermissionState;
  } catch {
    return 'unsupported';
  }
}

export async function requestMediaStream(
  kind: 'camera' | 'microphone',
  options?: { facingMode?: 'user' | 'environment' },
  nav?: Navigator
): Promise<MediaStreamResult> {
  const targetNav = nav ?? (typeof navigator !== 'undefined' ? navigator : undefined);

  if (!targetNav || !targetNav.mediaDevices?.getUserMedia) {
    return {
      stream: null,
      error: `${kind === 'camera' ? 'Camera' : 'Microphone'} access is not supported by this browser.`,
      stop: () => {},
    };
  }

  try {
    const constraints: MediaStreamConstraints =
      kind === 'camera'
        ? { video: { facingMode: options?.facingMode || 'environment' }, audio: false }
        : { audio: true, video: false };

    const stream = await targetNav.mediaDevices.getUserMedia(constraints);
    const stop = () => {
      stream.getTracks().forEach((track) => track.stop());
    };

    return { stream, error: null, stop };
  } catch (err: any) {
    let msg = `${kind === 'camera' ? 'Camera' : 'Microphone'} access was denied or failed.`;
    if (err?.name === 'NotAllowedError' || err?.name === 'PermissionDeniedError') {
      msg = `${kind === 'camera' ? 'Camera' : 'Microphone'} permission denied by user.`;
    } else if (err?.name === 'NotFoundError' || err?.name === 'DevicesNotFoundError') {
      msg = `No ${kind === 'camera' ? 'camera' : 'microphone'} device found on this system.`;
    }
    return {
      stream: null,
      error: msg,
      stop: () => {},
    };
  }
}

export async function executeWebShare(
  payload: ShareDataPayload,
  nav?: Navigator
): Promise<{ shared: boolean; method: 'native' | 'clipboard' | 'none' }> {
  const targetNav = nav ?? (typeof navigator !== 'undefined' ? navigator : undefined);

  if (targetNav && targetNav.share && targetNav.canShare?.(payload)) {
    try {
      await targetNav.share(payload);
      return { shared: true, method: 'native' };
    } catch (err: any) {
      if (err?.name === 'AbortError') {
        return { shared: false, method: 'none' };
      }
    }
  }

  // Fallback: Clipboard copy
  const textToCopy = payload.url || payload.text || payload.title;
  if (targetNav && targetNav.clipboard) {
    try {
      await targetNav.clipboard.writeText(textToCopy);
      return { shared: true, method: 'clipboard' };
    } catch {
      return { shared: false, method: 'none' };
    }
  }

  return { shared: false, method: 'none' };
}

export function sanitizeFileName(name: string): string {
  return name.replace(/[^\w.-]/gi, '_');
}

// ============================================================================
// REACT HOOK
// ============================================================================

export function useDeviceCapabilities() {
  const [isLocating, setIsLocating] = useState(false);
  const [locationError, setLocationError] = useState<string | null>(null);

  // Network Awareness state
  const [networkInfo, setNetworkInfo] = useState<NetworkConnectionInfo>(() => {
    const isOnline = typeof navigator !== 'undefined' ? navigator.onLine : true;
    const nav = typeof navigator !== 'undefined' ? (navigator as any) : null;
    const conn = nav?.connection || nav?.mozConnection || nav?.webkitConnection;
    return {
      isOnline,
      effectiveType: conn?.effectiveType,
      downlink: conn?.downlink,
      rtt: conn?.rtt,
      saveData: conn?.saveData,
    };
  });

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const handleOnline = () => {
      setNetworkInfo((prev) => ({ ...prev, isOnline: true }));
    };
    const handleOffline = () => {
      setNetworkInfo((prev) => ({ ...prev, isOnline: false }));
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    const nav = navigator as any;
    const conn = nav?.connection || nav?.mozConnection || nav?.webkitConnection;
    const handleConnectionChange = () => {
      setNetworkInfo({
        isOnline: navigator.onLine,
        effectiveType: conn?.effectiveType,
        downlink: conn?.downlink,
        rtt: conn?.rtt,
        saveData: conn?.saveData,
      });
    };

    if (conn && typeof conn.addEventListener === 'function') {
      conn.addEventListener('change', handleConnectionChange);
    }

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      if (conn && typeof conn.removeEventListener === 'function') {
        conn.removeEventListener('change', handleConnectionChange);
      }
    };
  }, []);

  const requestCurrentLocation = useCallback(async (): Promise<DeviceLocationResult | null> => {
    setIsLocating(true);
    setLocationError(null);
    const res = await queryDeviceLocation();
    setIsLocating(false);
    if (res.error) {
      setLocationError(res.error);
    }
    return res;
  }, []);

  const checkPermission = useCallback(
    async (permission: DevicePermissionName): Promise<DevicePermissionState> => {
      return queryDevicePermission(permission);
    },
    []
  );

  const requestCameraAccess = useCallback(
    async (facingMode: 'user' | 'environment' = 'environment'): Promise<MediaStreamResult> => {
      return requestMediaStream('camera', { facingMode });
    },
    []
  );

  const requestMicrophoneAccess = useCallback(async (): Promise<MediaStreamResult> => {
    return requestMediaStream('microphone');
  }, []);

  const requestNotificationPermission = useCallback(async (): Promise<NotificationPermission | 'unsupported'> => {
    if (typeof window === 'undefined' || !('Notification' in window)) {
      return 'unsupported';
    }
    try {
      return await Notification.requestPermission();
    } catch {
      return 'unsupported';
    }
  }, []);

  const shareContent = useCallback(
    async (payload: ShareDataPayload): Promise<{ shared: boolean; method: 'native' | 'clipboard' | 'none' }> => {
      return executeWebShare(payload);
    },
    []
  );

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

  const sanitizeFileMetadata = useCallback(async (file: File): Promise<File> => {
    const cleanName = sanitizeFileName(file.name);
    return new File([file], cleanName, {
      type: file.type,
      lastModified: Date.now(),
    });
  }, []);

  return {
    isLocating,
    locationError,
    networkInfo,
    requestCurrentLocation,
    checkPermission,
    requestCameraAccess,
    requestMicrophoneAccess,
    requestNotificationPermission,
    shareContent,
    copyToClipboard,
    sanitizeFileMetadata,
  };
}
