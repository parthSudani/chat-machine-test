import { Request, Response, NextFunction } from 'express';
import { messageService } from '../services/message.service';
import { sendSuccess } from '../utils/apiResponse';

export class MessageController {
  async sendMessage(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { chatId } = req.params as { chatId: string };
      const { senderId, text } = req.body as { senderId: string; text: string };
      const callerId = req.user!.id;

      const result = await messageService.sendMessage({
        chatId,
        senderId,
        text,
        callerId,
      });

      sendSuccess(res, result, 201);
    } catch (error) {
      next(error);
    }
  }

  async getMessages(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { chatId } = req.params as { chatId: string };
      const limit = Number(req.query.limit) || 50;
      const cursor = req.query.cursor as string | undefined;
      const callerId = req.user!.id;

      const result = await messageService.getMessages({
        chatId,
        limit,
        cursor,
        callerId,
      });

      sendSuccess(res, result, 200);
    } catch (error) {
      next(error);
    }
  }
}

export const messageController = new MessageController();
