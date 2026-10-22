import { Request, Response, NextFunction } from 'express';
import { userChatService } from '../services/userChat.service';
import { sendSuccess } from '../utils/apiResponse';

export class UserController {
  async getUserChats(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { userId } = req.params as { userId: string };
      const limit = Number(req.query.limit) || 20;
      const cursor = req.query.cursor as string | undefined;
      const callerId = req.user!.id;

      const data = await userChatService.getUserChats({
        targetUserId: userId,
        callerId,
        limit,
        cursor,
      });

      sendSuccess(
        res,
        {
          success: true,
          data,
        },
        200
      );
    } catch (error) {
      next(error);
    }
  }
}

export const userController = new UserController();
