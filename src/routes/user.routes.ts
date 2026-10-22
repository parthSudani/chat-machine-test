import { Router } from 'express';
import { userController } from '../controllers/user.controller';
import { validateRequest } from '../middleware/validate.middleware';
import { getUserChatsSchema } from '../validation/user.schema';
import { authenticate } from '../middleware/auth.middleware';

const router = Router();

// 6. GET /user/:userId/chats
router.get(
  '/:userId/chats',
  authenticate,
  validateRequest(getUserChatsSchema),
  (req, res, next) => userController.getUserChats(req, res, next)
);

export const userRoutes = router;
