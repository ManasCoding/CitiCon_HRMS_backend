import express from 'express';
import { 
  getProfile, updateProfile, uploadAvatar, tempUploadAvatar, 
  getDirectory, checkIn, checkOut, markGeofenceExit, getTodayAttendance, getStats, getLateCount, getAttendanceLog,
  applyLeave, getMyLeaves, getTasks, createTask, createBulkTasks, getWeeklyTasks,
  submitNote, getMyNotes, submitResignation, getMyResignations, getResignationById
} from '../controllers/employeeController.js';
import { getMyLeaveBalance, getMyLeaveTransactions } from '../controllers/leaveAccrualController.js';
import { upload } from '../cloudinary.js';

const router = express.Router();

router.get('/profile/:id', getProfile);
router.put('/profile/:id', updateProfile);
router.post('/upload-avatar/:id', upload.single('avatar'), uploadAvatar);
router.post('/upload-avatar/temp', upload.single('avatar'), tempUploadAvatar);
router.get('/directory', getDirectory);
router.post('/attendance/check-in', checkIn);
router.post('/attendance/check-out', checkOut);
router.post('/attendance/geofence-exit', markGeofenceExit);
router.get('/attendance/today/:employeeId', getTodayAttendance);
router.get('/attendance/log/:employeeId', getAttendanceLog);
router.get('/stats/:employeeId', getStats);
router.get('/late/count/:employeeId', getLateCount);
router.post('/leaves', applyLeave);
router.get('/leaves/:employeeId', getMyLeaves);
router.get('/leaves/balance/:employeeId', getMyLeaveBalance);
router.get('/leaves/transactions/:employeeId', getMyLeaveTransactions);
router.get('/tasks/:employeeId/:date', getTasks);
router.get('/tasks/weekly/:employeeId', getWeeklyTasks);
router.post('/tasks', createTask);
router.post('/tasks/bulk', createBulkTasks);
router.post('/notes', submitNote);
router.get('/notes/:employeeId', getMyNotes);
router.post('/resignations', upload.single('attachment'), submitResignation);
router.get('/resignations/:employeeId', getMyResignations);
router.get('/resignations/detail/:id', getResignationById);

export default router;

