import { describe, it, expect, beforeAll } from 'vitest';
import net from 'net';

function isPortOpen(host: string, port: number, timeoutMs = 1000): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    socket.setTimeout(timeoutMs);
    socket.once('connect', () => {
      socket.destroy();
      resolve(true);
    });
    socket.once('timeout', () => {
      socket.destroy();
      resolve(false);
    });
    socket.once('error', () => {
      socket.destroy();
      resolve(false);
    });
    socket.connect(port, host);
  });
}

describe('Firestore Emulator & Concurrency Integration Tests (Phase 4)', () => {
  let isFirestoreAvailable = false;
  const testChatId = 'integration-chat-' + Date.now();
  const testUserId = 'integration-user-' + Date.now();

  beforeAll(async () => {
    const host = process.env.FIRESTORE_EMULATOR_HOST || '127.0.0.1:8080';
    const [hostname, portStr] = host.split(':');
    const port = Number(portStr) || 8080;

    const emulatorRunning = await isPortOpen(hostname || '127.0.0.1', port, 800);

    if (emulatorRunning) {
      process.env.FIRESTORE_EMULATOR_HOST = `${hostname}:${port}`;
      isFirestoreAvailable = true;
    } else {
      console.warn(
        '\n⚠️  Firestore Emulator is currently not reachable on ' + host + '. Skipping live Firestore integration tests.\n' +
        '👉 To start Firestore Emulator, run: docker compose up -d firestore-emulator\n' +
        '   or: gcloud beta emulators firestore start --host-port=0.0.0.0:8080\n'
      );
      isFirestoreAvailable = false;
    }
  });

  it('verifies Firestore emulator availability status', () => {
    if (!isFirestoreAvailable) {
      console.log('Skipping live Firestore tests because Firestore emulator is offline.');
      return;
    }
    expect(isFirestoreAvailable).toBe(true);
  });

  describe('Read Receipts Idempotency in Firestore', () => {
    it('records read receipt and preserves original timestamp on repeat requests', async () => {
      if (!isFirestoreAvailable) return;

      const { messageFirestoreRepository } = await import('../../src/repositories/message.firestore.repository');

      const msg = await messageFirestoreRepository.createMessage(
        testChatId,
        'sender-1',
        'Hello read receipt test',
        'msg-read-1'
      );

      // First read: should be new
      const read1 = await messageFirestoreRepository.recordReadReceiptIdempotent(
        testChatId,
        msg.id,
        testUserId
      );

      expect(read1.isNew).toBe(true);
      expect(read1.receipt.userId).toBe(testUserId);
      expect(read1.receipt.readAt).toBeDefined();

      const originalTimestampMillis = read1.receipt.readAt.toMillis();

      // Second read (repeat): should NOT overwrite original timestamp
      const read2 = await messageFirestoreRepository.recordReadReceiptIdempotent(
        testChatId,
        msg.id,
        testUserId
      );

      expect(read2.isNew).toBe(false);
      expect(read2.receipt.readAt.toMillis()).toBe(originalTimestampMillis);
    });
  });

  describe('Last-Seen Monotonicity in Firestore', () => {
    it('advances last-seen for newer message and rejects older message', async () => {
      if (!isFirestoreAvailable) return;

      const { messageFirestoreRepository } = await import('../../src/repositories/message.firestore.repository');
      const { Timestamp } = await import('../../src/config/firebase');

      const t1 = Timestamp.fromMillis(10000);
      const t2 = Timestamp.fromMillis(20000);

      const msgOlder = await messageFirestoreRepository.createMessage(
        testChatId,
        'sender-1',
        'Older message',
        'msg-order-1',
        t1
      );

      const msgNewer = await messageFirestoreRepository.createMessage(
        testChatId,
        'sender-1',
        'Newer message',
        'msg-order-2',
        t2
      );

      // Step 1: Set older message first -> should update
      const res1 = await messageFirestoreRepository.updateLastSeenMonotonic(
        testChatId,
        testUserId,
        msgOlder
      );
      expect(res1.status).toBe('updated');
      expect(res1.lastSeenMessageId).toBe(msgOlder.id);

      // Step 2: Set newer message -> should update
      const res2 = await messageFirestoreRepository.updateLastSeenMonotonic(
        testChatId,
        testUserId,
        msgNewer
      );
      expect(res2.status).toBe('updated');
      expect(res2.lastSeenMessageId).toBe(msgNewer.id);

      // Step 3: Attempt to move backward by setting older message again -> must be ignored!
      const res3 = await messageFirestoreRepository.updateLastSeenMonotonic(
        testChatId,
        testUserId,
        msgOlder
      );
      expect(res3.status).toBe('ignored_older_than_current');
      expect(res3.lastSeenMessageId).toBe(msgNewer.id); // State still points to newer message!

      // Verify directly from Firestore document
      const currentDoc = await messageFirestoreRepository.getMemberLastSeen(
        testChatId,
        testUserId
      );
      expect(currentDoc?.lastSeenMessageId).toBe(msgNewer.id);
    });

    it('resolves equal timestamps using deterministic document ID tie-breaker', async () => {
      if (!isFirestoreAvailable) return;

      const { messageFirestoreRepository } = await import('../../src/repositories/message.firestore.repository');
      const { Timestamp } = await import('../../src/config/firebase');

      const sameTimestamp = Timestamp.fromMillis(50000);

      const msgA = await messageFirestoreRepository.createMessage(
        testChatId,
        'sender-1',
        'Tie-break A',
        'msg-tie-a',
        sameTimestamp
      );

      const msgB = await messageFirestoreRepository.createMessage(
        testChatId,
        'sender-1',
        'Tie-break B',
        'msg-tie-b',
        sameTimestamp
      );

      const tieUserId = 'tie-user-' + Date.now();

      // Advance to msgB
      const resB = await messageFirestoreRepository.updateLastSeenMonotonic(
        testChatId,
        tieUserId,
        msgB
      );
      expect(resB.status).toBe('updated');
      expect(resB.lastSeenMessageId).toBe(msgB.id);

      // Attempt to set msgA (lexicographically smaller than msgB with equal timestamp)
      const resA = await messageFirestoreRepository.updateLastSeenMonotonic(
        testChatId,
        tieUserId,
        msgA
      );
      // Because msgA.id < msgB.id, it is considered older -> must be ignored!
      expect(resA.status).toBe('ignored_older_than_current');
      expect(resA.lastSeenMessageId).toBe(msgB.id);
    });

    it('handles concurrent last-seen updates without race condition regression', async () => {
      if (!isFirestoreAvailable) return;

      const { messageFirestoreRepository } = await import('../../src/repositories/message.firestore.repository');
      const { Timestamp } = await import('../../src/config/firebase');

      const concUserId = 'conc-user-' + Date.now();
      const messages = await Promise.all([
        messageFirestoreRepository.createMessage(
          testChatId,
          'sender-1',
          'Msg 1',
          'msg-conc-1',
          Timestamp.fromMillis(100)
        ),
        messageFirestoreRepository.createMessage(
          testChatId,
          'sender-1',
          'Msg 2',
          'msg-conc-2',
          Timestamp.fromMillis(200)
        ),
        messageFirestoreRepository.createMessage(
          testChatId,
          'sender-1',
          'Msg 3',
          'msg-conc-3',
          Timestamp.fromMillis(300)
        ),
      ]);

      // Fire simultaneous updates in random order
      await Promise.all([
        messageFirestoreRepository.updateLastSeenMonotonic(testChatId, concUserId, messages[0]!),
        messageFirestoreRepository.updateLastSeenMonotonic(testChatId, concUserId, messages[2]!),
        messageFirestoreRepository.updateLastSeenMonotonic(testChatId, concUserId, messages[1]!),
      ]);

      // Final state must ALWAYS point to the newest message (messages[2])
      const finalDoc = await messageFirestoreRepository.getMemberLastSeen(
        testChatId,
        concUserId
      );
      expect(finalDoc?.lastSeenMessageId).toBe(messages[2]!.id);
    });
  });
});
