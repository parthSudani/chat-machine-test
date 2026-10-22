import { describe, it, expect, beforeAll } from 'vitest';
import net from 'net';
import { messageFirestoreRepository } from '../../src/repositories/message.firestore.repository';
import { Timestamp } from '../../src/config/firebase';
import { AppError } from '../../src/utils/appError';

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

describe('Firestore Messaging & Pagination Integration Tests (Phase 3)', () => {
  let isFirestoreAvailable = false;
  const testChatId = 'integration-phase3-chat-' + Date.now();
  const foreignChatId = 'integration-phase3-foreign-' + Date.now();
  const senderId = 'integration-sender-' + Date.now();

  beforeAll(async () => {
    const host = process.env.FIRESTORE_EMULATOR_HOST || '127.0.0.1:8080';
    const [hostname, portStr] = host.split(':');
    const port = Number(portStr) || 8080;

    const emulatorRunning = await isPortOpen(hostname || '127.0.0.1', port, 800);

    if (emulatorRunning) {
      process.env.FIRESTORE_EMULATOR_HOST = `${hostname}:${port}`;
      isFirestoreAvailable = true;
    } else {
      isFirestoreAvailable = false;
    }
  });

  it('verifies Firestore emulator connectivity status for Phase 3 messaging', () => {
    if (!isFirestoreAvailable) {
      console.log('Skipping live Firestore Phase 3 tests because Firestore emulator is offline.');
      return;
    }
    expect(isFirestoreAvailable).toBe(true);
  });

  describe('Message Creation and Server Timestamp', () => {
    it('persists message in Firestore with server timestamp and document ID', async () => {
      if (!isFirestoreAvailable) return;

      const msg = await messageFirestoreRepository.createMessage(
        testChatId,
        senderId,
        'Integration message text'
      );

      expect(msg.id).toBeDefined();
      expect(msg.chatId).toBe(testChatId);
      expect(msg.senderId).toBe(senderId);
      expect(msg.text).toBe('Integration message text');
      expect(msg.createdAt).toBeDefined();

      const fetched = await messageFirestoreRepository.getMessage(testChatId, msg.id);
      expect(fetched).not.toBeNull();
      expect(fetched?.id).toBe(msg.id);
      expect(fetched?.text).toBe('Integration message text');
    });
  });

  describe('Chronological Retrieval & Stable Ordering', () => {
    it('retrieves messages in ascending chronological order with deterministic tie-breaking', async () => {
      if (!isFirestoreAvailable) return;

      const t1 = Timestamp.fromMillis(100000);
      const t2 = Timestamp.fromMillis(200000);

      await messageFirestoreRepository.createMessage(
        testChatId,
        senderId,
        'First message',
        'p3-msg-1',
        t1
      );

      await messageFirestoreRepository.createMessage(
        testChatId,
        senderId,
        'Second message',
        'p3-msg-2',
        t2
      );

      const { messages, nextCursor } = await messageFirestoreRepository.getChatMessages(
        testChatId,
        50
      );

      expect(messages.length).toBeGreaterThanOrEqual(2);
      const msg1Index = messages.findIndex((m) => m.id === 'p3-msg-1');
      const msg2Index = messages.findIndex((m) => m.id === 'p3-msg-2');
      expect(msg1Index).toBeLessThan(msg2Index);
      expect(nextCursor).toBeNull();
    });

    it('returns empty array when chat has no messages', async () => {
      if (!isFirestoreAvailable) return;

      const emptyChatId = 'integration-empty-chat-' + Date.now();
      const { messages, nextCursor } = await messageFirestoreRepository.getChatMessages(
        emptyChatId,
        50
      );

      expect(messages).toEqual([]);
      expect(nextCursor).toBeNull();
    });
  });

  describe('Cursor Pagination & Validation', () => {
    it('paginates forward using cursor without duplicates or gaps', async () => {
      if (!isFirestoreAvailable) return;

      const page1 = await messageFirestoreRepository.getChatMessages(testChatId, 1);
      expect(page1.messages.length).toBe(1);
      expect(page1.nextCursor).toBeDefined();

      if (page1.nextCursor) {
        const page2 = await messageFirestoreRepository.getChatMessages(
          testChatId,
          1,
          page1.nextCursor
        );
        expect(page2.messages.length).toBe(1);
        expect(page2.messages[0]?.id).not.toBe(page1.messages[0]?.id);
      }
    });

    it('rejects nonexistent pagination cursor', async () => {
      if (!isFirestoreAvailable) return;

      await expect(
        messageFirestoreRepository.getChatMessages(testChatId, 10, 'nonexistent-cursor-id')
      ).rejects.toThrow(AppError);
    });

    it('rejects pagination cursor from another chat', async () => {
      if (!isFirestoreAvailable) return;

      const foreignMsg = await messageFirestoreRepository.createMessage(
        foreignChatId,
        senderId,
        'Foreign message',
        'p3-foreign-msg-1'
      );

      await expect(
        messageFirestoreRepository.getChatMessages(testChatId, 10, foreignMsg.id)
      ).rejects.toThrow(AppError);
    });
  });
});
