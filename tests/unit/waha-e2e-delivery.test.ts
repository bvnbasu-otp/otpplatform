import { describe, expect, it, vi } from 'vitest';
import {
  isActuallyDelivered,
  verifyWahaDelivery,
} from '../../scripts/verify-waha-e2e-delivery.mjs';

describe('WAHA actual-delivery verification', () => {
  it('does not treat API acceptance or pending/server acknowledgements as delivery', async () => {
    const sendMessage = vi.fn().mockResolvedValue({ id: 'msg-1', status: 'PENDING' });
    const getMessageStatus = vi
      .fn()
      .mockResolvedValueOnce({ id: 'msg-1', ack: 0 })
      .mockResolvedValueOnce({ id: 'msg-1', ack: 'SERVER' });

    await expect(
      verifyWahaDelivery({ sendMessage, getMessageStatus, maxStatusChecks: 2 }),
    ).rejects.toThrow(/accepted but actual delivery was not acknowledged/);
    expect(sendMessage).toHaveBeenCalledTimes(1);
    expect(getMessageStatus).toHaveBeenNthCalledWith(1, 'msg-1');
    expect(getMessageStatus).toHaveBeenNthCalledWith(2, 'msg-1');
  });

  it('passes only after WAHA reports device delivery or a stronger acknowledgement', async () => {
    const result = await verifyWahaDelivery({
      sendMessage: vi.fn().mockResolvedValue({ key: { id: 'msg-2' } }),
      getMessageStatus: vi
        .fn()
        .mockResolvedValueOnce({ ack: 1 })
        .mockResolvedValueOnce({ ack: 2 }),
      maxStatusChecks: 3,
    });

    expect(result).toEqual({
      delivered: true,
      messageId: 'msg-2',
      acknowledgement: 2,
      observations: [
        { attempt: 1, ack: 1 },
        { attempt: 2, ack: 2 },
      ],
    });
    expect(isActuallyDelivered({ status: 'READ' })).toBe(true);
    expect(isActuallyDelivered({ status: 'PENDING' })).toBe(false);
  });

  it('fails when WAHA acceptance has no message id to query', async () => {
    const getMessageStatus = vi.fn();
    await expect(
      verifyWahaDelivery({
        sendMessage: vi.fn().mockResolvedValue({ status: 'PENDING' }),
        getMessageStatus,
      }),
    ).rejects.toThrow(/did not return a message id/);
    expect(getMessageStatus).not.toHaveBeenCalled();
  });
});
