import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  queryDeviceLocation,
  queryDevicePermission,
  requestMediaStream,
  executeWebShare,
  sanitizeFileName,
  useDeviceCapabilities,
} from '../useDeviceCapabilities';
import { useOnlineStatus } from '../useOnlineStatus';

describe('useDeviceCapabilities & Device Hardening Suite', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('exports all hook functions and pure runtime evaluators', () => {
    expect(useDeviceCapabilities).toBeDefined();
    expect(typeof useDeviceCapabilities).toBe('function');
    expect(useOnlineStatus).toBeDefined();
    expect(typeof useOnlineStatus).toBe('function');
    expect(queryDeviceLocation).toBeDefined();
    expect(queryDevicePermission).toBeDefined();
    expect(requestMediaStream).toBeDefined();
    expect(executeWebShare).toBeDefined();
    expect(sanitizeFileName).toBeDefined();
  });

  describe('1. Geolocation & Graceful Degradation', () => {
    it('returns coordinates when geolocation is granted', async () => {
      const mockNav = {
        geolocation: {
          getCurrentPosition: vi.fn((success) => {
            success({
              coords: { latitude: 12.9716, longitude: 77.5946 },
            });
          }),
        },
      } as unknown as Navigator;

      const result = await queryDeviceLocation(mockNav);
      expect(result.latitude).toBe(12.9716);
      expect(result.longitude).toBe(77.5946);
      expect(result.error).toBeUndefined();
    });

    it('returns clear error when permission is denied', async () => {
      const mockNav = {
        geolocation: {
          getCurrentPosition: vi.fn((_success, error) => {
            error({
              code: 1,
              PERMISSION_DENIED: 1,
              message: 'Permission denied',
            });
          }),
        },
      } as unknown as Navigator;

      const result = await queryDeviceLocation(mockNav);
      expect(result.latitude).toBe(0);
      expect(result.longitude).toBe(0);
      expect(result.error).toContain('Location permission denied');
    });

    it('returns error when geolocation is unavailable in browser', async () => {
      const mockNav = {} as unknown as Navigator;
      const result = await queryDeviceLocation(mockNav);
      expect(result.error).toContain('Geolocation is not supported');
    });
  });

  describe('2. Camera & Microphone Media Access and Lifecycle Cleanup', () => {
    it('requests camera stream with specified facingMode and provides stop teardown', async () => {
      const stopMock = vi.fn();
      const mockStream = {
        getTracks: () => [{ stop: stopMock }],
      } as unknown as MediaStream;

      const getUserMediaMock = vi.fn().mockResolvedValue(mockStream);
      const mockNav = {
        mediaDevices: { getUserMedia: getUserMediaMock },
      } as unknown as Navigator;

      const res = await requestMediaStream('camera', { facingMode: 'environment' }, mockNav);
      expect(getUserMediaMock).toHaveBeenCalledWith({
        video: { facingMode: 'environment' },
        audio: false,
      });
      expect(res.stream).toBe(mockStream);
      expect(res.error).toBeNull();

      // Ensure stop releases active camera stream hardware
      res.stop();
      expect(stopMock).toHaveBeenCalled();
    });

    it('handles camera permission denial gracefully', async () => {
      const notAllowed = new Error('Permission denied');
      notAllowed.name = 'NotAllowedError';

      const mockNav = {
        mediaDevices: {
          getUserMedia: vi.fn().mockRejectedValue(notAllowed),
        },
      } as unknown as Navigator;

      const res = await requestMediaStream('camera', undefined, mockNav);
      expect(res.stream).toBeNull();
      expect(res.error).toContain('Camera permission denied');
    });

    it('requests microphone stream and handles teardown', async () => {
      const stopMock = vi.fn();
      const mockStream = {
        getTracks: () => [{ stop: stopMock }],
      } as unknown as MediaStream;

      const getUserMediaMock = vi.fn().mockResolvedValue(mockStream);
      const mockNav = {
        mediaDevices: { getUserMedia: getUserMediaMock },
      } as unknown as Navigator;

      const res = await requestMediaStream('microphone', undefined, mockNav);
      expect(getUserMediaMock).toHaveBeenCalledWith({
        audio: true,
        video: false,
      });
      expect(res.stream).toBe(mockStream);

      res.stop();
      expect(stopMock).toHaveBeenCalled();
    });
  });

  describe('3. Web Share API & Clipboard Fallback', () => {
    it('uses navigator.share when available and valid', async () => {
      const shareMock = vi.fn().mockResolvedValue(undefined);
      const mockNav = {
        share: shareMock,
        canShare: vi.fn().mockReturnValue(true),
      } as unknown as Navigator;

      const res = await executeWebShare(
        { title: 'RFQ 102', url: 'https://otp.market/rfq/102' },
        mockNav
      );

      expect(res).toEqual({ shared: true, method: 'native' });
      expect(shareMock).toHaveBeenCalled();
    });

    it('falls back to clipboard when share is not available', async () => {
      const writeTextMock = vi.fn().mockResolvedValue(undefined);
      const mockNav = {
        clipboard: { writeText: writeTextMock },
      } as unknown as Navigator;

      const res = await executeWebShare(
        { title: 'RFQ 102', url: 'https://otp.market/rfq/102' },
        mockNav
      );

      expect(res).toEqual({ shared: true, method: 'clipboard' });
      expect(writeTextMock).toHaveBeenCalledWith('https://otp.market/rfq/102');
    });
  });

  describe('4. Privacy-by-Design Sanitization', () => {
    it('sanitizes unsafe characters in file names to prevent directory traversal or injection', () => {
      expect(sanitizeFileName('../../secret-spec.pdf')).toBe('.._.._secret-spec.pdf');
      expect(sanitizeFileName('motor photo (1) #final.jpg')).toBe('motor_photo__1___final.jpg');
    });
  });

  describe('5. Permissions Query Engine', () => {
    it('queries navigator.permissions status', async () => {
      const mockNav = {
        permissions: {
          query: vi.fn().mockResolvedValue({ state: 'granted' }),
        },
      } as unknown as Navigator;

      const status = await queryDevicePermission('geolocation', mockNav);
      expect(status).toBe('granted');
    });

    it('queries system notification permissions from window object', async () => {
      const mockWin = {
        Notification: { permission: 'denied' },
      } as unknown as Window;

      const status = await queryDevicePermission('notifications', undefined, mockWin);
      expect(status).toBe('denied');
    });
  });
});
