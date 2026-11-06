import express from 'express';
import {
  getLiveQrCode,
  verifyQrToken,
  scanQrAttendance,
  registerDeviceAndCheckIn,
  getAdminDevices,
  getAdminDeviceById,
  blockDevice,
  unblockDevice,
  resetDevice,
  removeDevice,
  getQrStats,
  getQrSettings,
  updateQrSettings
} from '../controllers/qrAttendanceController.js';

const router = express.Router();

// ── Mobile Scanning & Device Verification (Public / Mobile Facing) ─────────────
router.get('/office-qr', getLiveQrCode);
router.post('/verify-token', verifyQrToken);
router.post('/scan', scanQrAttendance);
router.post('/register-and-checkin', registerDeviceAndCheckIn);

// ── Admin QR Attendance Management ───────────────────────────────────────────
router.get('/admin/devices', getAdminDevices);
router.get('/admin/devices/:id', getAdminDeviceById);
router.put('/admin/devices/:id/block', blockDevice);
router.put('/admin/devices/:id/unblock', unblockDevice);
router.post('/admin/devices/:id/reset', resetDevice);
router.delete('/admin/devices/:id', removeDevice);

router.get('/admin/stats', getQrStats);
router.get('/admin/settings', getQrSettings);
router.put('/admin/settings', updateQrSettings);

export default router;
