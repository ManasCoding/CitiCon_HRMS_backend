import express from 'express';
import {
  createSiteVisit,
  getSiteVisits,
  getSiteVisitById,
  approveSiteVisit,
  rejectSiteVisit,
  checkInSiteVisit,
  checkOutSiteVisit,
  getEmployeeSiteVisits,
  getActiveVisits,
  getSiteVisitReports
} from '../controllers/siteVisitController.js';

const router = express.Router();

router.post('/', createSiteVisit);
router.get('/', getSiteVisits);
router.get('/active', getActiveVisits);
router.get('/reports', getSiteVisitReports);
router.get('/employee/:employeeId', getEmployeeSiteVisits);
router.get('/:id', getSiteVisitById);
router.post('/:id/approve', approveSiteVisit);
router.post('/:id/reject', rejectSiteVisit);
router.post('/:id/check-in', checkInSiteVisit);
router.post('/:id/check-out', checkOutSiteVisit);

export default router;
