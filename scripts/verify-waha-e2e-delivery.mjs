import { pathToFileURL } from 'node:url';

const DELIVERED_ACKS = new Set(['DEVICE', 'DELIVERED', 'READ', 'PLAYED']);
const DELIVERED_NUMERIC_ACK = 2;

function normalizedAck(record) {
  const raw = record?.ack ?? record?.status ?? record?.deliveryStatus ?? null;
  if (typeof raw === 'number') return raw;
  return typeof raw === 'string' ? raw.trim().toUpperCase() : null;
}

export function isActuallyDelivered(record) {
  const ack = normalizedAck(record);
  return typeof ack === 'number'
    ? ack >= DELIVERED_NUMERIC_ACK
    : typeof ack === 'string' && DELIVERED_ACKS.has(ack);
}

/**
 * Verifies WAHA delivery through injected adapters. `sendMessage` must return
 * WAHA's message id; acceptance alone is not success. `getMessageStatus` must
 * read that message back from the WAHA status API. Tests supply mocks, so this
 * module never needs hosted credentials or a real recipient.
 */
export async function verifyWahaDelivery({
  sendMessage,
  getMessageStatus,
  maxStatusChecks = 3,
}) {
  if (typeof sendMessage !== 'function' || typeof getMessageStatus !== 'function') {
    throw new Error('WAHA delivery verification requires sendMessage and getMessageStatus adapters');
  }
  if (!Number.isInteger(maxStatusChecks) || maxStatusChecks < 1) {
    throw new Error('maxStatusChecks must be a positive integer');
  }

  const accepted = await sendMessage();
  const messageId = accepted?.id ?? accepted?.messageId ?? accepted?.key?.id ?? null;
  if (!messageId) {
    throw new Error('WAHA did not return a message id; delivery cannot be verified');
  }

  const observations = [];
  for (let attempt = 1; attempt <= maxStatusChecks; attempt += 1) {
    const status = await getMessageStatus(messageId);
    const ack = normalizedAck(status);
    observations.push({ attempt, ack });
    if (isActuallyDelivered(status)) {
      return {
        delivered: true,
        messageId,
        acknowledgement: ack,
        observations,
      };
    }
  }

  throw new Error(
    `WAHA message ${messageId} was accepted but actual delivery was not acknowledged after ${maxStatusChecks} status checks`,
  );
}

async function main() {
  throw new Error(
    'Live WAHA dispatch is disabled in this repository utility. Run the mocked delivery contract test or provide reviewed local-only adapters from a separate harness.',
  );
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  main().catch((error) => {
    console.error(`WAHA delivery verification refused: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  });
}
