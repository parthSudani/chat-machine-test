import { Request, Response } from 'express';
import net from 'net';
import { prisma } from '../config/prisma';
import { firestore } from '../config/firebase';
import { env } from '../config/env';

function checkTcpPort(host: string, port: number, timeoutMs = 1500): Promise<boolean> {
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

export class HealthController {
  /**
   * Liveness probe: reports if the process is up and running
   */
  liveness(_req: Request, res: Response): void {
    res.status(200).json({
      status: 'ok',
      uptime: process.uptime(),
      timestamp: new Date().toISOString(),
    });
  }

  /**
   * Readiness probe: checks dependencies without leaking credentials or writing test records
   */
  async readiness(_req: Request, res: Response): Promise<void> {
    const checks: { database: 'up' | 'down'; firestore: 'up' | 'down' } = {
      database: 'down',
      firestore: 'down',
    };

    // 1. Check PostgreSQL connection with strict timeout
    try {
      if (process.env.DATABASE_URL) {
        const timeoutPromise = new Promise((_, reject) =>
          setTimeout(() => reject(new Error('Database ping timed out')), 1500)
        );
        await Promise.race([prisma.$queryRaw`SELECT 1`, timeoutPromise]);
        checks.database = 'up';
      }
    } catch {
      checks.database = 'down';
    }

    // 2. Check Firestore connectivity with safe socket probe or timeout
    try {
      const emulatorHost = process.env.FIRESTORE_EMULATOR_HOST || env.FIRESTORE_EMULATOR_HOST;
      if (emulatorHost) {
        const [host, portStr] = emulatorHost.split(':');
        const port = Number(portStr) || 8080;
        const isUp = await checkTcpPort(host || 'localhost', port, 1500);
        checks.firestore = isUp ? 'up' : 'down';
      } else if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
        const timeoutPromise = new Promise((_, reject) =>
          setTimeout(() => reject(new Error('Firestore ping timed out')), 1500)
        );
        await Promise.race([firestore.listCollections(), timeoutPromise]);
        checks.firestore = 'up';
      } else {
        checks.firestore = 'down';
      }
    } catch {
      checks.firestore = 'down';
    }

    const isReady = checks.database === 'up' && checks.firestore === 'up';
    const statusCode = isReady ? 200 : 503;

    res.status(statusCode).json({
      status: isReady ? 'ready' : 'degraded',
      checks,
      timestamp: new Date().toISOString(),
    });
  }
}

export const healthController = new HealthController();
