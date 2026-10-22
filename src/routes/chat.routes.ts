import { Router } from 'express';
import { chatController } from '../controllers/chat.controller';
import { messageController } from '../controllers/message.controller';
import { readReceiptController } from '../controllers/readReceipt.controller';
import { lastSeenController } from '../controllers/lastSeen.controller';
import { validateRequest } from '../middleware/validate.middleware';
import { createChatSchema } from '../validation/chat.schema';
import {
  sendMessageSchema,
  getMessagesSchema,
  markMessageReadSchema,
  updateLastSeenSchema,
} from '../validation/message.schema';
import { authenticate } from '../middleware/auth.middleware';

const router = Router();

// 1. POST /chat/create
router.post('/create', authenticate, validateRequest(createChatSchema), (req, res, next) =>
  chatController.create(req, res, next)
);

// 2. POST /chat/:chatId/message/send
router.post(
  '/:chatId/message/send',
  authenticate,
  validateRequest(sendMessageSchema),
  (req, res, next) => messageController.sendMessage(req, res, next)
);

// 3. GET /chat/:chatId/messages?limit=50
router.get(
  '/:chatId/messages',
  authenticate,
  validateRequest(getMessagesSchema),
  (req, res, next) => messageController.getMessages(req, res, next)
);

// 4. POST /chat/:chatId/message/:messageId/read
router.post(
  '/:chatId/message/:messageId/read',
  authenticate,
  validateRequest(markMessageReadSchema),
  (req, res, next) => readReceiptController.markRead(req, res, next)
);

// 5. POST /chat/:chatId/lastseen
router.post(
  '/:chatId/lastseen',
  authenticate,
  validateRequest(updateLastSeenSchema),
  (req, res, next) => lastSeenController.updateLastSeen(req, res, next)
);

export const chatRoutes = router;
