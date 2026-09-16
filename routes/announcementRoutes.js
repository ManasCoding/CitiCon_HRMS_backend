import express from 'express';
import {
  createAnnouncement,
  getAnnouncements,
  getActiveAnnouncements,
  updateAnnouncement,
  deleteAnnouncement
} from '../controllers/announcementController.js';

const router = express.Router();

// Get active announcements (Accessible by employees and admin)
router.get('/active', getActiveAnnouncements);

// CRUD operations (Admin usually, but adding no middleware here to match other routes style unless required)
router.post('/', createAnnouncement);
router.get('/', getAnnouncements);
router.put('/:id', updateAnnouncement);
router.delete('/:id', deleteAnnouncement);

export default router;
