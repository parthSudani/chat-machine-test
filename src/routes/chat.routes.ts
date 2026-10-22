import { Router } from 'express';
import { chatController } from '../controllers/chat.controller';
import { validateRequest } from '../middleware/validate.middleware';
import { createChatSchema } from '../validation/chat.schema';
import { authenticate } from '../middleware/auth.middleware';

const router = Router();

router.post('/create', authenticate, validateRequest(createChatSchema), (req, res, next) =>
  chatController.create(req, res, next)
);

export const chatRoutes = router;
