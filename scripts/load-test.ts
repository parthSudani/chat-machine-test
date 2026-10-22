process.env.NODE_ENV = 'test';
process.env.DISABLE_RATE_LIMIT = 'true';

import http from 'http';
import autocannon from 'autocannon';
import jwt from 'jsonwebtoken';
import { app } from '../src/app';
import { env } from '../src/config/env';
import { chatService } from '../src/services/chat.service';
import { messageService } from '../src/services/message.service';
import { readReceiptService } from '../src/services/readReceipt.service';
import { lastSeenService } from '../src/services/lastSeen.service';
import { userChatService } from '../src/services/userChat.service';

interface BenchmarkResult {
  endpoint: string;
  method: string;
  requestsPerSec: number;
  p50LatencyMs: number;
  p95LatencyMs: number;
  p99LatencyMs: number;
  totalRequests: number;
  non2xx: number;
  errorRatePercent: number;
}

async function runBenchmark(
  name: string,
  opts: autocannon.Options
): Promise<BenchmarkResult> {
  process.stdout.write(`Benchmarking ${name}... `);

  return new Promise((resolve, reject) => {
    autocannon(opts, (err, result) => {
      if (err) return reject(err);

      const res: BenchmarkResult = {
        endpoint: name,
        method: (opts.method as string) || 'GET',
        requestsPerSec: Math.round(result.requests.average),
        p50LatencyMs: Math.round((result.latency.p50 ?? result.latency.average) * 100) / 100,
        p95LatencyMs: Math.round(((result.latency as any).p97_5 ?? result.latency.average) * 100) / 100,
        p99LatencyMs: Math.round((result.latency.p99 ?? result.latency.average) * 100) / 100,
        totalRequests: result.requests.total,
        non2xx: result.non2xx,
        errorRatePercent:
          result.requests.total > 0
            ? Math.round((result.non2xx / result.requests.total) * 10000) / 100
            : 0,
      };

      console.log(`Done! (${res.requestsPerSec} req/sec, p95: ${res.p95LatencyMs}ms)`);
      resolve(res);
    });
  });
}

async function main() {
  console.log('================================================================');
  console.log('       CHAT BACKEND PERFORMANCE & LOAD BENCHMARK (PHASE 10)     ');
  console.log('================================================================\n');

  const startMem = process.memoryUsage();
  console.log(`Initial Memory Heap: ${Math.round(startMem.heapUsed / 1024 / 1024)} MB`);

  // Start HTTP server on dynamic port
  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, resolve));
  const address = server.address() as { port: number };
  const port = address.port;
  const baseUrl = `http://127.0.0.1:${port}`;
  console.log(`Benchmark server running on ${baseUrl}\n`);

  // Generate tokens and IDs
  const aliceId = '11111111-1111-4111-8111-111111111111';
  const bobId = '22222222-2222-4222-8222-222222222222';
  const chatId = '33333333-3333-4333-8333-333333333333';
  const msgId = 'msg-bench-1';

  const aliceToken = jwt.sign({ sub: aliceId, email: 'alice@example.com' }, env.JWT_SECRET);
  const bobToken = jwt.sign({ sub: bobId, email: 'bob@example.com' }, env.JWT_SECRET);

  // Configure high-performance in-memory service mocks for controlled benchmark
  chatService.createDirectChat = async () => ({
    chatId,
    isNew: false,
  });

  messageService.sendMessage = async (dto) => ({
    messageId: 'msg-bench-' + Date.now(),
    chatId: dto.chatId,
    senderId: dto.senderId,
    text: dto.text,
    createdAt: new Date().toISOString(),
  });

  messageService.getMessages = async (dto) => ({
    messages: Array.from({ length: Math.min(dto.limit, 50) }).map((_, i) => ({
      id: `msg-${i}`,
      chatId: dto.chatId,
      senderId: aliceId,
      text: 'Benchmark test message',
      createdAt: new Date().toISOString(),
    })),
    pagination: { limit: dto.limit, nextCursor: null, hasMore: false },
  });

  readReceiptService.markMessageRead = async (dto) => ({
    messageId: dto.messageId,
    userId: dto.callerId,
    readAt: new Date().toISOString(),
    status: 'read',
  });

  lastSeenService.updateLastSeen = async (dto) => ({
    chatId: dto.chatId,
    userId: dto.callerId,
    lastSeenMessageId: dto.messageId,
    lastSeenAt: new Date().toISOString(),
    status: 'updated',
  });

  userChatService.getUserChats = async () => ({
    chats: [
      {
        chatId,
        type: 'DIRECT',
        memberIds: [aliceId, bobId],
        createdAt: new Date().toISOString(),
      },
    ],
    nextCursor: null,
  });

  const duration = 3; // 3 seconds per benchmark
  const connections = 10;
  const results: BenchmarkResult[] = [];

  // 1. GET /health
  results.push(
    await runBenchmark('GET /health', {
      url: `${baseUrl}/health`,
      method: 'GET',
      duration,
      connections,
    })
  );

  // 2. POST /chat/create
  results.push(
    await runBenchmark('POST /chat/create', {
      url: `${baseUrl}/chat/create`,
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${aliceToken}`,
      },
      body: JSON.stringify({ userAId: aliceId, userBId: bobId }),
      duration,
      connections,
    })
  );

  // 3. POST /chat/:chatId/message/send
  results.push(
    await runBenchmark('POST /chat/:chatId/message/send', {
      url: `${baseUrl}/chat/${chatId}/message/send`,
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${aliceToken}`,
      },
      body: JSON.stringify({ senderId: aliceId, text: 'Performance load message' }),
      duration,
      connections,
    })
  );

  // 4. GET /chat/:chatId/messages?limit=50
  results.push(
    await runBenchmark('GET /chat/:chatId/messages?limit=50', {
      url: `${baseUrl}/chat/${chatId}/messages?limit=50`,
      method: 'GET',
      headers: {
        authorization: `Bearer ${aliceToken}`,
      },
      duration,
      connections,
    })
  );

  // 5. POST /chat/:chatId/message/:messageId/read
  results.push(
    await runBenchmark('POST /chat/:chatId/message/:messageId/read', {
      url: `${baseUrl}/chat/${chatId}/message/${msgId}/read`,
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${bobToken}`,
      },
      body: JSON.stringify({ userId: bobId }),
      duration,
      connections,
    })
  );

  // 6. POST /chat/:chatId/lastseen
  results.push(
    await runBenchmark('POST /chat/:chatId/lastseen', {
      url: `${baseUrl}/chat/${chatId}/lastseen`,
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${bobToken}`,
      },
      body: JSON.stringify({ userId: bobId, messageId: msgId }),
      duration,
      connections,
    })
  );

  // 7. GET /user/:userId/chats
  results.push(
    await runBenchmark('GET /user/:userId/chats', {
      url: `${baseUrl}/user/${aliceId}/chats?limit=20`,
      method: 'GET',
      headers: {
        authorization: `Bearer ${aliceToken}`,
      },
      duration,
      connections,
    })
  );

  server.close();

  const endMem = process.memoryUsage();
  console.log(`\nFinal Memory Heap: ${Math.round(endMem.heapUsed / 1024 / 1024)} MB`);
  console.log(
    `Memory Delta: ${Math.round((endMem.heapUsed - startMem.heapUsed) / 1024 / 1024)} MB\n`
  );

  console.log('------------------------------------------------------------------------------------------------------');
  console.log('| Endpoint                               | Method | Req/sec | p50 (ms) | p95 (ms) | p99 (ms) | Error Rate |');
  console.log('------------------------------------------------------------------------------------------------------');
  for (const r of results) {
    const ep = r.endpoint.padEnd(38);
    const m = r.method.padEnd(6);
    const rps = String(r.requestsPerSec).padStart(7);
    const p50 = String(r.p50LatencyMs).padStart(8);
    const p95 = String(r.p95LatencyMs).padStart(8);
    const p99 = String(r.p99LatencyMs).padStart(8);
    const err = `${r.errorRatePercent}%`.padStart(10);
    console.log(`| ${ep} | ${m} | ${rps} | ${p50} | ${p95} | ${p99} | ${err} |`);
  }
  console.log('------------------------------------------------------------------------------------------------------');
}

main().catch((err) => {
  console.error('Benchmark failed:', err);
  process.exit(1);
});
