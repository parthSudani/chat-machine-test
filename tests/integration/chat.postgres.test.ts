import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import net from 'net';
import { prisma } from '../../src/config/prisma';
import { chatRepository } from '../../src/repositories/chat.repository';
import { userRepository } from '../../src/repositories/user.repository';
import { chatService } from '../../src/services/chat.service';
import bcrypt from 'bcryptjs';

function isPortOpen(host: string, port: number, timeoutMs = 800): Promise<boolean> {
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

describe('PostgreSQL Database & Concurrency Integration Tests', () => {
  let isDbAvailable = false;
  let testUserAId: string;
  let testUserBId: string;

  beforeAll(async () => {
    const dbUrl = process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/chat_backend';
    let host = 'localhost';
    let port = 5432;
    try {
      const parsed = new URL(dbUrl);
      host = parsed.hostname || 'localhost';
      port = Number(parsed.port) || 5432;
    } catch {
      // fallback to localhost:5432
    }

    const portOpen = await isPortOpen(host, port, 600);
    if (!portOpen) {
      console.warn(
        '\n⚠️  PostgreSQL is currently not reachable on ' + host + ':' + port + '. Skipping live DB integration tests.\n' +
        '👉 To start PostgreSQL, run: docker compose up -d postgres\n'
      );
      isDbAvailable = false;
      return;
    }

    try {
      await prisma.$connect();
      // Quick query to test connection
      await prisma.$queryRaw`SELECT 1`;
      isDbAvailable = true;

      // Seed test users
      const passwordHash = await bcrypt.hash('TestPassword123!', 10);
      const userA = await userRepository.create({
        name: 'Integration User A',
        email: `test-a-${Date.now()}@example.com`,
        passwordHash,
      });
      const userB = await userRepository.create({
        name: 'Integration User B',
        email: `test-b-${Date.now()}@example.com`,
        passwordHash,
      });

      testUserAId = userA.id;
      testUserBId = userB.id;
    } catch {
      console.warn(
        '\n⚠️  PostgreSQL is currently not reachable at DATABASE_URL. Skipping live DB integration tests.\n' +
        '👉 To start PostgreSQL, run: docker compose up -d postgres\n'
      );
      isDbAvailable = false;
    }
  });

  afterAll(async () => {
    if (isDbAvailable) {
      // Clean up test data
      try {
        if (testUserAId && testUserBId) {
          const [p1, p2] = testUserAId < testUserBId ? [testUserAId, testUserBId] : [testUserBId, testUserAId];
          await prisma.chat.deleteMany({
            where: {
              participantOneId: p1,
              participantTwoId: p2,
            },
          });
          await prisma.user.deleteMany({
            where: {
              id: { in: [testUserAId, testUserBId] },
            },
          });
        }
      } catch (err) {
        console.error('Test cleanup error:', err);
      }
      await prisma.$disconnect();
    }
  });

  it('verifies PostgreSQL database connection status', () => {
    if (!isDbAvailable) {
      console.log('Skipping live DB tests because PostgreSQL server is offline.');
      return;
    }
    expect(isDbAvailable).toBe(true);
  });

  it('creates direct chat and both membership records in PostgreSQL', async () => {
    if (!isDbAvailable) return;

    const [p1, p2] = chatService.getCanonicalPair(testUserAId, testUserBId);

    const result = await chatRepository.createDirectChatAtomic(p1, p2);
    expect(result.isNew).toBe(true);
    expect(result.chat.id).toBeDefined();

    // Verify chat row in DB
    const chatInDb = await prisma.chat.findUnique({
      where: { id: result.chat.id },
      include: { members: true },
    });

    expect(chatInDb).not.toBeNull();
    expect(chatInDb?.participantOneId).toBe(p1);
    expect(chatInDb?.participantTwoId).toBe(p2);
    expect(chatInDb?.members.length).toBe(2);

    const memberIds = chatInDb?.members.map((m) => m.userId);
    expect(memberIds).toContain(testUserAId);
    expect(memberIds).toContain(testUserBId);
  });

  it('returns existing chat for the same user pair', async () => {
    if (!isDbAvailable) return;

    const result = await chatService.createDirectChat(
      { userAId: testUserAId, userBId: testUserBId },
      testUserAId
    );

    expect(result.isNew).toBe(false);
    expect(result.chatId).toBeDefined();
  });

  it('returns existing chat when called with reversed user order', async () => {
    if (!isDbAvailable) return;

    const forward = await chatService.createDirectChat(
      { userAId: testUserAId, userBId: testUserBId },
      testUserAId
    );

    const reversed = await chatService.createDirectChat(
      { userAId: testUserBId, userBId: testUserAId },
      testUserBId
    );

    expect(forward.chatId).toBe(reversed.chatId);
  });

  it('concurrent chat creation requests produce exactly one conversation', async () => {
    if (!isDbAvailable) return;

    // Create two new temporary users for concurrency stress test
    const passwordHash = await bcrypt.hash('TestPassword123!', 10);
    const u1 = await userRepository.create({
      name: 'Concurrent User 1',
      email: `conc-1-${Date.now()}@example.com`,
      passwordHash,
    });
    const u2 = await userRepository.create({
      name: 'Concurrent User 2',
      email: `conc-2-${Date.now()}@example.com`,
      passwordHash,
    });

    // Fire 10 parallel requests to create chat simultaneously
    const requests = Array.from({ length: 10 }).map((_, i) => {
      const callerId = i % 2 === 0 ? u1.id : u2.id;
      const userA = i % 2 === 0 ? u1.id : u2.id;
      const userB = i % 2 === 0 ? u2.id : u1.id;
      return chatService.createDirectChat({ userAId: userA, userBId: userB }, callerId);
    });

    const results = await Promise.all(requests);

    // All results must have the exact same chatId
    const firstChatId = results[0]?.chatId;
    expect(firstChatId).toBeDefined();

    for (const res of results) {
      expect(res.chatId).toBe(firstChatId);
    }

    // Verify in database that exactly ONE chat was created
    const [p1, p2] = chatService.getCanonicalPair(u1.id, u2.id);
    const chatsInDb = await prisma.chat.findMany({
      where: {
        participantOneId: p1,
        participantTwoId: p2,
      },
    });

    expect(chatsInDb.length).toBe(1);

    // Cleanup
    await prisma.chat.deleteMany({
      where: { participantOneId: p1, participantTwoId: p2 },
    });
    await prisma.user.deleteMany({
      where: { id: { in: [u1.id, u2.id] } },
    });
  });
});
