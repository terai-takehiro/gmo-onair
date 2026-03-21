import { Router } from 'express';
import { queryOne, queryAll } from '../db/connection';
import { requireAuth } from '../middleware/auth';
import { AppError } from '../middleware/errorHandler';

const router = Router();

router.post('/login', (req, res) => {
  const { userId } = req.body;
  if (!userId) throw new AppError(400, 'VALIDATION_ERROR', 'userId is required');
  const user = queryOne('SELECT id, name, email, role FROM users WHERE id = ? AND deleted_at IS NULL', [userId]);
  if (!user) throw new AppError(404, 'NOT_FOUND', 'User not found');
  res.json({ success: true, data: user });
});

router.get('/users', (_req, res) => {
  const users = queryAll('SELECT id, name, email, role FROM users WHERE deleted_at IS NULL ORDER BY name');
  res.json({ success: true, data: users });
});

router.post('/logout', (_req, res) => {
  res.json({ success: true, message: 'Logged out' });
});

router.get('/me', requireAuth, (req, res) => {
  res.json({ success: true, data: req.user });
});

export default router;
