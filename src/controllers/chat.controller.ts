import { Request, Response, NextFunction } from 'express';
import { chatService } from '../services/chat.service';
import { sendSuccess } from '../utils/apiResponse';

export class ChatController {
  async create(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const callerId = req.user!.id;
      const result = await chatService.createDirectChat(req.body, callerId);
      
      const statusCode = result.isNew ? 201 : 200;
      sendSuccess(res, { chatId: result.chatId }, statusCode);
    } catch (error) {
      next(error);
    }
  }
}

export const chatController = new ChatController();
