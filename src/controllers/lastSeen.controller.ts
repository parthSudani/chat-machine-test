import { Request, Response, NextFunction } from 'express';
import { lastSeenService } from '../services/lastSeen.service';
import { sendSuccess } from '../utils/apiResponse';

export class LastSeenController {
  async updateLastSeen(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { chatId } = req.params as { chatId: string };
      const { userId, messageId } = req.body as { userId: string; messageId: string };
      const callerId = req.user!.id;

      const result = await lastSeenService.updateLastSeen({
        chatId,
        messageId,
        bodyUserId: userId,
        callerId,
      });

      sendSuccess(res, result, 200);
    } catch (error) {
      next(error);
    }
  }
}

export const lastSeenController = new LastSeenController();
