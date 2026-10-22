import { Router } from 'express';
import { authController } from '../controllers/auth.controller';
import { validateRequest } from '../middleware/validate.middleware';
import { registerSchema, loginSchema } from '../validation/auth.schema';
import { authenticate } from '../middleware/auth.middleware';

const router = Router();

router.post('/register', validateRequest(registerSchema), (req, res, next) =>
  authController.register(req, res, next)
);

router.post('/login', validateRequest(loginSchema), (req, res, next) =>
  authController.login(req, res, next)
);

router.get('/me', authenticate, (req, res, next) =>
  authController.me(req, res, next)
);

export const authRoutes = router;
