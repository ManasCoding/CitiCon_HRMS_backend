import express from 'express';
import { 
  getEmployees, getExEmployees, createEmployee, updateEmployee, deleteEmployee, 
  getLogs, getStats, getAllAttendance, getWeeklyAttendance, getLeaves, updateLeaveStatus, 
  createNotification, updateSettings, getEmployeeDocuments, uploadDocument, deleteDocument,
  getEmployeeActivityLogs, getAdmins, createAdmin, deleteAdmin, getHourlyReports,
  getEmployeeHourlyReports, getPresentEmployees, getHalfDayEmployees, getLateEmployees,
  getAbsentEmployees, getActiveLeaveEmployees, getEmployeeNotes,
  exportAttendanceExcel, exportAttendancePdf, updateEmployeeCheckIn, updateEmployeeCheckOut,
  updateAttendanceStatus, updateAttendanceRecord,
  getAllResignations, updateResignationStatus, getResignationById, updateResignationChecklist, getEmployeeTasksByDate,
  getLateApprovals, approveLateCheckIn, rejectLateCheckIn,
  checkAdminEmail, updateAdmin, upgradeEmployee, emailHourlyReportsExcel
} from '../controllers/adminController.js';
import { getAdminTimesheets, getTimesheetById } from '../controllers/timesheetController.js';
import { upload } from '../cloudinary.js';
import {
  getEmployeeLeaveBalance, processMonthlyAccrual, backfillAccruals,
  adminLeaveAdjustment, getAccrualOverview
} from '../controllers/leaveAccrualController.js';

const router = express.Router();

router.get('/employees', getEmployees);
router.get('/employees/ex', getExEmployees);
router.post('/employees', createEmployee);
router.post('/employees/:id/upgrade', upgradeEmployee);
router.put('/employees/:id', updateEmployee);
router.delete('/employees/:id', deleteEmployee);
router.get('/logs', getLogs);
router.get('/stats', getStats);
router.get('/attendance/all', getAllAttendance);
router.get('/attendance/weekly', getWeeklyAttendance);
router.get('/attendance/present', getPresentEmployees);
router.get('/attendance/halfday', getHalfDayEmployees);
router.get('/attendance/late', getLateEmployees);
router.get('/attendance/absent', getAbsentEmployees);
router.put('/attendance/checkin', updateEmployeeCheckIn);
router.put('/attendance/checkout', updateEmployeeCheckOut);
router.put('/attendance/status', updateAttendanceStatus);
router.patch('/attendance/:id', updateAttendanceRecord);

// Late Check-In Approval Routes
router.get('/attendance/late-approvals', getLateApprovals);
router.put('/attendance/late-approvals/:id/approve', approveLateCheckIn);
router.put('/attendance/late-approvals/:id/reject', rejectLateCheckIn);
router.get('/leaves/active', getActiveLeaveEmployees);
router.get('/leaves', getLeaves);
router.patch('/leaves/:id', updateLeaveStatus);

// ── Earned Leave Accrual Routes ─────────────────────────────────────────────
router.get('/leaves/accrual/overview', getAccrualOverview);
router.get('/leaves/accrual/balance/:employeeId', getEmployeeLeaveBalance);
router.post('/leaves/accrual/process', processMonthlyAccrual);
router.post('/leaves/accrual/backfill', backfillAccruals);
router.post('/leaves/adjustment', adminLeaveAdjustment);
// ──────────────────────────────────────────────────────────────────────
router.post('/notifications', createNotification);
router.post('/settings', updateSettings);
router.get('/admins/check-email', checkAdminEmail);
router.get('/admins', getAdmins);
router.post('/admins', createAdmin);
router.put('/admins/:id', updateAdmin);
router.delete('/admins/:id', deleteAdmin);
router.get('/reports/hourly', getHourlyReports);
router.get('/reports/hourly/:id', getEmployeeHourlyReports);
router.get('/reports/hourly/email/excel', emailHourlyReportsExcel);
router.get('/reports/export/excel', exportAttendanceExcel);
router.get('/reports/export/pdf', exportAttendancePdf);

// Documents
router.get('/documents/:employeeId', getEmployeeDocuments);
router.post('/documents', uploadDocument);
router.delete('/documents/:id', deleteDocument);
router.get('/activity-logs/:employeeId', getEmployeeActivityLogs);
router.post('/documents/upload-file', upload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ success: false, message: 'Upload failed' });
  res.json({ success: true, url: req.file.path });
});

// Employee Notes / Messages
router.get('/notes/:employeeId', getEmployeeNotes);

// Resignations
router.get('/resignations', getAllResignations);
router.get('/resignations/:id', getResignationById);
router.patch('/resignations/:id', updateResignationStatus);
router.patch('/resignations/:id/checklist', updateResignationChecklist);

// Employee Timesheet Task Viewer
router.get('/tasks/:employeeId', getEmployeeTasksByDate);

// Timesheet Routes for Admin
router.get('/timesheets', getAdminTimesheets);
router.get('/timesheets/:id', getTimesheetById);

export default router;
