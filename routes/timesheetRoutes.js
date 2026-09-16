import express from 'express';
import { submitTimesheet, updateTimesheet, getEmployeeTimesheets } from '../controllers/timesheetController.js';

const router = express.Router();

router.post('/submit', submitTimesheet);
router.put('/:id', updateTimesheet);
router.get('/:employeeId', getEmployeeTimesheets);
// The '/month/:month' filter is handled by query params in getEmployeeTimesheets

export default router;
