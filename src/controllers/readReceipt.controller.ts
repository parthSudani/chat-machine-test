import { Request, Response, NextFunction } from 'express';
import { readReceiptService } from '../services/readReceipt.service';
import { sendSuccess } from '../utils/apiResponse';

export class ReadReceiptController {
  async markRead(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { chatId, messageId } = req.params as { chatId: string; messageId: string };
      const bodyUserId = req.body?.userId as string | undefined;
      const callerId = req.user!.id;

      const result = await readReceiptService.markMessageRead({
        chatId,
        messageId,
        bodyUserId,
        callerId,
      });

      sendSuccess(res, result, 200);
    } catch (error) {
      next(error);
    }
  }
}

export const readReceiptController = new ReadReceiptController();
