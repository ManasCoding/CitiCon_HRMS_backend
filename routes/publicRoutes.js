import express from 'express';
import { getNotifications, getSettings } from '../controllers/publicController.js';

const router = express.Router();

router.get('/notifications', getNotifications);
router.get('/settings', getSettings);

export default router;
