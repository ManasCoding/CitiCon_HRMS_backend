import express from 'express';
import {
  getPayrollPreview,
  getAttendanceSummary,
  getAttendanceSummaryAll,
  generatePayroll,
  getPayrollHistory,
  getPayrollSlip,
  deletePayroll,
  updatePayroll,
  updatePdfUrl
} from '../controllers/payrollController.js';

const router = express.Router();

// ── History & Slip (before generic /:id routes) ──────────────────────────────
router.get('/history/:employeeId', getPayrollHistory);
router.get('/slip/:payrollId',     getPayrollSlip);

// ── Live Attendance Summary (real-time, no caching) ──────────────────────────
// GET /api/payroll/attendance-summary/:employeeId/:month/:year
router.get('/attendance-summary/:employeeId/:month/:year', getAttendanceSummary);

// ── Bulk Attendance Summary (all active employees) ────────────────────────────
// GET /api/payroll/attendance-summary-all/:month/:year
router.get('/attendance-summary-all/:month/:year', getAttendanceSummaryAll);

// ── Preview (checks if generated; if not, returns live stats) ────────────────
router.get('/:employeeId/:month/:year', getPayrollPreview);

// ── Generate / Mutate ─────────────────────────────────────────────────────────
router.post('/generate',    generatePayroll);
router.put('/:id/pdf',      updatePdfUrl);
router.put('/update/:id',   updatePayroll);
router.delete('/:id',       deletePayroll);

export default router;
