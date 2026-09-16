import mongoose from 'mongoose';
import Employee from '../models/Employee.js';
import Notification from '../models/Notification.js';
import Attendance from '../models/Attendance.js';
import Note from '../models/Note.js';
import Task from '../models/Task.js';
import { getIo } from '../socket.js';
import SystemSetting from '../models/SystemSetting.js';
import Resignation from '../models/Resignation.js';
import LeaveRequest from '../models/LeaveRequest.js';
import LeaveTransaction from '../models/LeaveTransaction.js';
import Holiday from '../models/Holiday.js';
import { getLeaveBalance } from './leaveAccrualController.js';
import { calculateAttendanceStatus, ATTENDANCE_CONFIG, getTodayDateIST } from '../utils/attendanceCalculator.js';

// Helper for distance calculation
const getDistance = (lat1, lon1, lat2, lon2) => {
  const R = 6371e3; // metres
  const φ1 = lat1 * Math.PI / 180; // φ, λ in radians
  const φ2 = lat2 * Math.PI / 180;
  const Δφ = (lat2 - lat1) * Math.PI / 180;
  const Δλ = (lon2 - lon1) * Math.PI / 180;

  const a = Math.sin(Δφ/2) * Math.sin(Δφ/2) +
            Math.cos(φ1) * Math.cos(φ2) *
            Math.sin(Δλ/2) * Math.sin(Δλ/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  return R * c; // in metres
};

export const getProfile = async (req, res) => {
  try {
    const isObjectId = req.params.id.match(/^[0-9a-fA-F]{24}$/);
    const query = isObjectId ? { _id: req.params.id } : { empCode: req.params.id };
    const employee = await Employee.findOne(query).select('-password');
    if (!employee) return res.status(404).json({ success: false, message: 'Employee not found' });
    res.json({ success: true, employee });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

export const updateProfile = async (req, res) => {
  try {
    const allowedFields = ['fullName', 'phone', 'email', 'profileImage', 'password'];
    const updates = {};
    allowedFields.forEach(f => { if (req.body[f] !== undefined) updates[f] = req.body[f]; });
    
    const isObjectId = req.params.id.match(/^[0-9a-fA-F]{24}$/);
    const query = isObjectId ? { _id: req.params.id } : { empCode: req.params.id };
    
    const employee = await Employee.findOneAndUpdate(query, updates, { new: true }).select('-password');
    if (!employee) return res.status(404).json({ success: false, message: 'Employee not found' });
    res.json({ success: true, employee });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

export const uploadAvatar = async (req, res) => {
  try {
    const isObjectId = req.params.id.match(/^[0-9a-fA-F]{24}$/);
    const query = isObjectId ? { _id: req.params.id } : { empCode: req.params.id };

    if (!req.file) {
      return res.status(400).json({ success: false, message: 'No file uploaded' });
    }

    const employee = await Employee.findOneAndUpdate(
      query,
      { profileImage: req.file.path },
      { new: true }
    ).select('-password');

    if (!employee) return res.status(404).json({ success: false, message: 'Employee not found' });

    res.json({ success: true, profileImage: req.file.path, employee });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

export const tempUploadAvatar = async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ success: false, message: 'No file uploaded' });
    res.json({ success: true, profileImage: req.file.path });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

export const getDirectory = async (req, res) => {
  try {
    const employees = await Employee.find({ status: 'Active' }).select('fullName empCode email phone department role profileImage joinDate').sort({ fullName: 1 });
    res.json({ success: true, employees });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

const applyDisplayStatus = (attendance) => {
  if (!attendance) return attendance;
  const doc = attendance.toObject ? attendance.toObject() : { ...attendance };
  
  const calc = calculateAttendanceStatus(doc);
  doc.status = calc.status;
  doc.workHours = calc.workHours;
  doc.overtime = calc.overtime;
  doc.liveStateText = calc.liveStateText;
  doc.workingSeconds = calc.workingSeconds;
  doc.overtimeSeconds = calc.overtimeSeconds;
  doc.isOnLunchBreak = calc.isOnLunchBreak;
  doc.isShiftCompleted = calc.isShiftCompleted;
  doc.isLate = calc.isLate;
  doc.lateMinutes = calc.lateMinutes;
  
  return doc;
};


export const checkIn = async (req, res) => {
  const { employeeId, lat, lng } = req.body;
  const now = new Date();
  
  // Get local date in YYYY-MM-DD format (Asia/Kolkata)
  const tzStr = now.toLocaleString('en-US', { timeZone: 'Asia/Kolkata' });
  const localDate = new Date(tzStr);
  const today = getTodayDateIST();

  // Block check-in on Sunday (day 0)
  if (localDate.getDay() === 0) {
    return res.json({ success: false, message: 'Today is Sunday — no attendance required.' });
  }
  
  try {
    let attendance = await Attendance.findOne({ employeeId, date: today });
    if (!attendance || !attendance.checkIn) {
      // Validate GPS Geofence strictly on backend
      const numLat = parseFloat(lat);
      const numLng = parseFloat(lng);
      if (isNaN(numLat) || isNaN(numLng)) {
        return res.status(400).json({ 
          success: false, 
          message: 'Location permission and valid GPS coordinates are required to check in.' 
        });
      }

      const settings = await SystemSetting.find({ key: { $in: ['office_lat', 'office_lng', 'geofence_radius'] } });
      const settingsMap = settings.reduce((acc, s) => ({ ...acc, [s.key]: parseFloat(s.value) }), {});
      
      const officeLat = settingsMap.office_lat || 20.2961;
      const officeLng = settingsMap.office_lng || 85.8331;
      const allowedRadius = settingsMap.geofence_radius || 50;

      const distance = getDistance(numLat, numLng, officeLat, officeLng);
      if (distance > allowedRadius) {
        return res.status(400).json({ 
          success: false, 
          message: `Check-in failed: You are ${Math.round(distance)}m away from the office. Must be within ${allowedRadius}m.` 
        });
      }

      // Official check-in threshold: 9:30 AM IST
      const LATE_THRESHOLD = '09:30';
      const HALF_DAY_THRESHOLD = '13:30';
      
      const currentHour = localDate.getHours();
      const currentMin  = localDate.getMinutes();
      const currentTimeStr = String(currentHour).padStart(2, '0') + ':' + String(currentMin).padStart(2, '0');

      // Calculate minutes late from 9:30 AM
      const thresholdMins = 9 * 60 + 30; // 570
      const currentTotalMins = currentHour * 60 + currentMin;
      const lateMinutes = Math.max(0, currentTotalMins - thresholdMins);
      
      let status = 'Present';
      let isLate = false;
      let checkInApprovalStatus = 'Not Required';
      let approvalRequestedAt = null;
      let exceptionType = 'None';
      let originalStatus = null;

      if (currentTimeStr >= HALF_DAY_THRESHOLD) {
        // At or after 1:30 PM — treat as Half Day pending approval
        isLate = true;
        checkInApprovalStatus = 'Pending';
        approvalRequestedAt = now;
        exceptionType = 'Half Day';
        status = 'Half Day';
      } else if (currentTimeStr >= LATE_THRESHOLD) {
        // At or after 9:30 AM — Late, requires approval
        isLate = true;
        checkInApprovalStatus = 'Pending';
        approvalRequestedAt = now;
        exceptionType = 'Late';
        status = 'Late';
      }
      // else: before 9:30 AM — on time, no approval needed

      if (!attendance) {
        attendance = await Attendance.create({
          employeeId,
          date: today,
          checkIn: now,
          location: { lat, lng },
          status,
          isLate,
          lateMinutes,
          checkInApprovalStatus,
          approvalRequestedAt,
          exceptionType,
          originalStatus
        });
      } else {
        // Attendance record existed without checkIn (e.g. from timesheet remarks)
        attendance.checkIn = now;
        attendance.location = { lat, lng };
        attendance.status = status;
        attendance.isLate = isLate;
        attendance.lateMinutes = lateMinutes;
        attendance.checkInApprovalStatus = checkInApprovalStatus;
        attendance.approvalRequestedAt = approvalRequestedAt;
        attendance.exceptionType = exceptionType;
        attendance.originalStatus = originalStatus;
        await attendance.save();
      }

      const lateApprovalPending = checkInApprovalStatus === 'Pending';
      return res.json({ success: true, attendance: applyDisplayStatus(attendance), alreadyCheckedIn: false, lateApprovalPending });
    }
    
    // Already checked in. If they re-enter geofence, clear the lastExitTime.
    if (attendance.lastExitTime) {
      attendance.lastExitTime = null;
      await attendance.save();
    }

    // If approval was rejected, they should NOT be able to re-check in
    // Return the existing record so the frontend can show the rejection UI
    const lateApprovalPending = attendance.checkInApprovalStatus === 'Pending';
    
    return res.json({ success: true, attendance: applyDisplayStatus(attendance), alreadyCheckedIn: true, lateApprovalPending });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};


export const checkOut = async (req, res) => {
  const { employeeId } = req.body;
  const now = new Date();
  const today = getTodayDateIST();

  try {
    let attendance = await Attendance.findOne({ employeeId, date: today });
    if (!attendance || !attendance.checkIn) {
      return res.status(400).json({ success: false, message: 'No check-in record found for today.' });
    }

    if (attendance.checkOut) {
      return res.json({ success: true, attendance: applyDisplayStatus(attendance), message: 'Already checked out today.' });
    }

    const checkOutTime = now;
    attendance.checkOut = checkOutTime;
    attendance.workStatus = 'Completed';
    attendance.lastExitTime = null;

    const calc = calculateAttendanceStatus(attendance, { currentTime: checkOutTime });
    attendance.status = calc.status;
    attendance.workHours = calc.workHours;
    attendance.overtime = calc.overtime;
    attendance.totalWorkingSeconds = calc.workingSeconds;
    attendance.totalOvertimeSeconds = calc.overtimeSeconds;

    const fullDayThresholdSec = (ATTENDANCE_CONFIG.FULL_DAY_THRESHOLD_MINUTES || 495) * 60;
    if (calc.workingSeconds < fullDayThresholdSec) {
      if (attendance.checkInApprovalStatus === 'Not Required') {
        attendance.status = calc.status;
        attendance.exceptionType = calc.status === 'Absent' ? 'Absent' : 'Half Day';
        attendance.checkInApprovalStatus = 'Pending';
        attendance.approvalRequestedAt = now;
      } else if (attendance.checkInApprovalStatus === 'Pending' && attendance.exceptionType === 'Late') {
        attendance.exceptionType = calc.status === 'Absent' ? 'Absent' : 'Half Day';
        attendance.status = calc.status;
      }
    }

    await attendance.save();

    return res.json({ success: true, attendance: applyDisplayStatus(attendance), message: 'Checked out successfully.' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};


export const markGeofenceExit = async (req, res) => {
  const { employeeId } = req.body;
  const now = new Date();
  const today = getTodayDateIST();
  
  try {
    let attendance = await Attendance.findOne({ employeeId, date: today });
    if (!attendance || !attendance.checkIn) {
      return res.status(404).json({ success: false, message: 'No check-in record found for today.' });
    }
    
    // Only set it if they haven't checked out
    if (!attendance.checkOut) {
      attendance.lastExitTime = now;
      await attendance.save();
      return res.json({ success: true, message: 'Geofence exit marked, 1-hour grace period started.' });
    }
    
    return res.json({ success: true, message: 'Already checked out.' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

export const getTodayAttendance = async (req, res) => {
  try {
    const today = getTodayDateIST();
    let attendance = await Attendance.findOne({ employeeId: req.params.employeeId, date: today });

    if (!attendance || !attendance.checkIn) {
      return res.json({
        success: true,
        attendance: null,
        status: 'NOT_CHECKED_IN'
      });
    }

    res.json({ success: true, attendance: applyDisplayStatus(attendance), status: attendance.status });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};


export const getStats = async (req, res) => {
  try {
    const { employeeId } = req.params;
    const { month, year, period } = req.query; // period = 'month' | 'year'

    const now = new Date();
    const targetYear = year ? parseInt(year) : now.getFullYear();
    const targetMonth = month ? String(month).padStart(2, '0') : String(now.getMonth() + 1).padStart(2, '0');

    // Build date regex based on period
    const isYearly = period === 'year';
    const dateRegex = isYearly ? `^${targetYear}` : `^${targetYear}-${targetMonth}`;

    // Get settings for leave quotas
    const settings = await SystemSetting.find({ key: { $in: ['casual_leave', 'sick_leave'] } });
    const settingsMap = settings.reduce((acc, s) => ({ ...acc, [s.key]: parseFloat(s.value) }), {});
    const totalLeaveQuota = (settingsMap.casual_leave || 12) + (settingsMap.sick_leave || 10);

    // Fetch all records for the period to calculate stats accurately with display statuses
    const periodRecords = await Attendance.find({
      employeeId,
      date: { $regex: dateRegex }
    });

    let presentDays = 0;
    let halfDays = 0;
    let lateDays = 0; // count from applyDisplayStatus loop

    periodRecords.forEach(record => {
      const displayDoc = applyDisplayStatus(record);
      if (displayDoc.status === 'Present' || displayDoc.status === 'Late') {
        presentDays++;
      }
      if (displayDoc.status === 'Late' || displayDoc.isLate) {
        lateDays++;
      }
      if (displayDoc.status === 'Half Day') {
        halfDays++;
      }
      // absentDays is calculated later by subtracting from workingDays
    });

    // Working days in the period (Mon-Sat count, exclude Sundays)
    const startDate = isYearly ? new Date(`${targetYear}-01-01`) : new Date(`${targetYear}-${targetMonth}-01`);
    const endDate = isYearly ? new Date(`${targetYear}-12-31`) : new Date(targetYear, parseInt(targetMonth), 0);
    const effectiveEnd = endDate > now ? now : endDate;
    let workingDays = 0;
    const d = new Date(startDate);
    while (d <= effectiveEnd) {
      const day = d.getDay();
      if (day !== 0) workingDays++; // exclude Sundays (0), keep Monday-Saturday
      d.setDate(d.getDate() + 1);
    }

    // Week Offs (Sundays count in full target month/year)
    const monthStart = isYearly ? new Date(`${targetYear}-01-01`) : new Date(`${targetYear}-${targetMonth}-01`);
    const monthEnd = isYearly ? new Date(`${targetYear}-12-31`) : new Date(targetYear, parseInt(targetMonth), 0);
    let weekOffs = 0;
    const tempD = new Date(monthStart);
    while (tempD <= monthEnd) {
      if (tempD.getDay() === 0) weekOffs++;
      tempD.setDate(tempD.getDate() + 1);
    }

    // Leaves taken in period (approved leaves overlapping period)
    const formatDate = (date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
    const periodStart = formatDate(startDate);
    const periodEnd = formatDate(effectiveEnd);
    const empObjId = mongoose.Types.ObjectId.isValid(employeeId) ? new mongoose.Types.ObjectId(employeeId) : employeeId;
    const approvedLeaves = await LeaveRequest.find({
      employeeId: empObjId,
      status: 'APPROVED',
      fromDate: { $lte: periodEnd },
      toDate: { $gte: periodStart }
    });
    let leavesTaken = 0;
    for (const leave of approvedLeaves) {
      const lStart = new Date(Math.max(new Date(leave.fromDate), startDate));
      const lEnd = new Date(Math.min(new Date(leave.toDate), effectiveEnd));
      const diffDays = Math.round((lEnd - lStart) / (1000 * 60 * 60 * 24)) + 1;
      if (diffDays > 0) leavesTaken += diffDays;
    }
    // Pending leave requests
    const pendingLeavesResult = await LeaveRequest.aggregate([
      { 
        $match: { 
          employeeId: empObjId, 
          status: 'PENDING' 
        } 
      },
      { $group: { _id: null, totalDays: { $sum: '$days' } } }
    ]);
    const pendingLeaves = pendingLeavesResult.length > 0 ? pendingLeavesResult[0].totalDays : 0;

    // Rejected leave requests (all time - sum of days)
    const rejectedLeavesResult = await LeaveRequest.aggregate([
      { 
        $match: { 
          employeeId: empObjId, 
          status: 'REJECTED' 
        } 
      },
      { $group: { _id: null, totalDays: { $sum: '$days' } } }
    ]);
    const rejectedLeaves = rejectedLeavesResult.length > 0 ? rejectedLeavesResult[0].totalDays : 0;

    // Absent = working days - present - half days - leaves taken
    const absentDays = Math.max(0, workingDays - presentDays - halfDays - leavesTaken);

    // Fetch total holidays for the target period
    const holidaysQuery = isYearly 
      ? { holidayDate: { $regex: `^${targetYear}-` }, isHoliday: true }
      : { holidayDate: { $regex: dateRegex }, isHoliday: true };
    const holidaysInPeriod = await Holiday.find(holidaysQuery);
    const holidayCount = holidaysInPeriod.length;

    // Available leaves = quota - total approved leave days this year
    const yearStart = `${targetYear}-01-01`;
    const yearEnd = `${targetYear}-12-31`;
    const approvedThisYearResult = await LeaveRequest.aggregate([
      { 
        $match: { 
          employeeId: empObjId,
          status: 'APPROVED',
          fromDate: { $lte: yearEnd },
          toDate: { $gte: yearStart }
        } 
      },
      { $group: { _id: null, totalDays: { $sum: '$days' } } }
    ]);
    const totalApprovedDaysThisYear = approvedThisYearResult.length > 0 ? approvedThisYearResult[0].totalDays : 0;
    const availableLeaves = Math.max(0, totalLeaveQuota - totalApprovedDaysThisYear);

    res.json({
      success: true,
      stats: {
        workingDays,
        presentDays,
        absentDays,
        halfDays,
        weekOffs,
        leavesTaken,
        holidayCount,
        holidays: holidaysInPeriod,
        availableLeaves,
        pendingLeaves,
        rejectedLeaves,
        attendanceRate: workingDays > 0 ? parseFloat(((presentDays + halfDays * 0.5) / workingDays * 100).toFixed(2)) : 0,
        lateCount: lateDays,
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

export const getLateCount = async (req, res) => {
  try {
    const { employeeId } = req.params;
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const dateRegex = `^${year}-${month}`;

    const records = await Attendance.find({
      employeeId,
      date: { $regex: dateRegex }
    });

    let count = 0;
    records.forEach(r => {
      const doc = applyDisplayStatus(r);
      if (doc.status === 'Late' || doc.isLate) {
        count++;
      }
    });

    res.json({ success: true, count });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

export const applyLeave = async (req, res) => {
  try {
    const { employeeId, leaveType, fromDate, toDate, reason } = req.body;

    if (!employeeId || !leaveType || !fromDate || !toDate || !reason) {
      return res.status(400).json({ success: false, message: 'All fields are required.' });
    }

    if (!mongoose.Types.ObjectId.isValid(employeeId)) {
      return res.status(400).json({ success: false, message: 'Invalid employee ID.' });
    }

    const start = new Date(fromDate);
    const end = new Date(toDate);
    if (isNaN(start) || isNaN(end) || end < start) {
      return res.status(400).json({ success: false, message: 'Invalid date range.' });
    }
    const days = Math.round((end - start) / (1000 * 60 * 60 * 24)) + 1;

    // ── Earned leave balance check ───────────────────────────────────────
    const availableBalance = await getLeaveBalance(employeeId);
    if (availableBalance < days) {
      return res.status(400).json({
        success: false,
        message: `Insufficient leave balance. Available balance: ${availableBalance} day${availableBalance === 1 ? '' : 's'}.`
      });
    }
    // ──────────────────────────────────────────────────────────────────

    const formatDate = (date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
    const formattedFromDate = formatDate(start);
    const formattedToDate = formatDate(end);

    const leave = await LeaveRequest.create({
      employeeId: new mongoose.Types.ObjectId(employeeId),
      leaveType,
      fromDate: formattedFromDate,
      toDate: formattedToDate,
      days,
      reason
    });
    res.json({ success: true, leave });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

export const getMyLeaves = async (req, res) => {
  try {
    const { employeeId } = req.params;
    
    // Build query — cast to ObjectId if valid, otherwise try string match
    const query = mongoose.Types.ObjectId.isValid(employeeId)
      ? { employeeId: new mongoose.Types.ObjectId(employeeId) }
      : { employeeId };
    
    const leaves = await LeaveRequest.find(query).sort({ appliedOn: -1 }).limit(20);
    res.json({ success: true, leaves });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

export const getTasks = async (req, res) => {
  try {
    const tasks = await Task.find({ employeeId: req.params.employeeId, date: req.params.date });
    res.json({ success: true, tasks });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

export const getAttendanceLog = async (req, res) => {
  try {
    const { employeeId } = req.params;
    const { month, year } = req.query;
    const dateRegex = `^${year}-${String(month).padStart(2, '0')}`;
    
    const records = await Attendance.find({
      employeeId,
      date: { $regex: dateRegex }
    }).sort({ date: -1 });

    const transformedRecords = records.map(applyDisplayStatus);
    res.json({ success: true, records: transformedRecords });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

export const createTask = async (req, res) => {
  try {
    const task = await Task.create(req.body);
    res.json({ success: true, task });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

export const createBulkTasks = async (req, res) => {
  try {
    const { employeeId, tasks, dates, dailyRemarks, weeklyRemarks } = req.body;

    // ── Server-side time-lock validation (IST) ───────────────────────────────
    // Convert server time to IST regardless of server timezone
    const istNow   = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Kolkata' }));
    const todayIST = [
      istNow.getFullYear(),
      String(istNow.getMonth() + 1).padStart(2, '0'),
      String(istNow.getDate()).padStart(2, '0'),
    ].join('-');
    const nowMinIST = istNow.getHours() * 60 + istNow.getMinutes();

    // Parse "HH:MM" end-time from a slot key like "09:30 - 10:30"
    // Hours 01-08 → PM (13-20),  09-12 → AM/noon
    const slotEndMin = (slotKey) => {
      const endStr = (slotKey || '').split(' - ')[1]?.trim() || '00:00';
      const [h, m] = endStr.split(':').map(Number);
      return ((h >= 1 && h <= 8) ? h + 12 : h) * 60 + m;
    };

    if (tasks && tasks.length > 0) {
      for (const task of tasks) {
        // ── Date check ─────────────────────────────────────────────────────
        if (task.date !== todayIST) {
          return res.status(403).json({
            success: false,
            message: task.date < todayIST
              ? `Timesheet for ${task.date} is locked. Past-date entries cannot be modified.`
              : `Timesheet for ${task.date} is not yet available.`,
          });
        }

        // ── Grace period check (slot end + 15 min) ─────────────────────────
        const graceEndMin = slotEndMin(task.slotKey) + 15;
        if (nowMinIST > graceEndMin) {
          return res.status(403).json({
            success: false,
            message: `Slot "${task.slotKey}" is locked — the 15-minute grace period has expired.`,
          });
        }
      }
    }

    // ── Safe upsert per task (never touches locked/past slots in DB) ─────────
    if (tasks && tasks.length > 0) {
      for (const task of tasks) {
        await Task.findOneAndUpdate(
          { employeeId, date: task.date, slotKey: task.slotKey },
          { title: task.title, status: task.status || 'Completed', employeeId, date: task.date, slotKey: task.slotKey },
          { upsert: true, new: true }
        );
      }
    }

    // ── Update attendance only for dates that have submitted content ──────────
    const updatedDates = new Set((tasks || []).map(t => t.date));
    // Also include today's date if it has daily remarks even without tasks
    if (dailyRemarks) {
      Object.keys(dailyRemarks).forEach(d => { if (d === todayIST) updatedDates.add(d); });
    }

    for (const date of updatedDates) {
      const updateData = { workStatus: 'Completed' };
      if (dailyRemarks?.[date]) updateData.remarks = dailyRemarks[date];
      await Attendance.findOneAndUpdate(
        { employeeId, date },
        updateData,
        { upsert: false }
      );
    }

    // Emit real-time event to Admin dashboard
    const io = getIo();
    if (io) {
      io.emit('timesheetUpdated', { 
        employeeId, 
        dates: Array.from(updatedDates) 
      });
    }

    res.json({ success: true, message: 'Tasks and remarks updated successfully' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

export const getWeeklyTasks = async (req, res) => {
  try {
    const { employeeId } = req.params;
    const { startDate, endDate } = req.query;
    
    const tasks = await Task.find({
      employeeId,
      date: { $gte: startDate, $lte: endDate }
    });
    
    res.json({ success: true, tasks });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// ── Employee Notes (messages to admin) ───────────────────────────────────────

export const submitNote = async (req, res) => {
  try {
    const { employeeId, message } = req.body;
    if (!employeeId || !message || !message.trim()) {
      return res.status(400).json({ success: false, message: 'Employee ID and message are required.' });
    }
    if (!mongoose.Types.ObjectId.isValid(employeeId)) {
      return res.status(400).json({ success: false, message: 'Invalid employee ID.' });
    }
    const note = await Note.create({
      employeeId: new mongoose.Types.ObjectId(employeeId),
      message: message.trim(),
    });
    res.json({ success: true, note });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

export const getMyNotes = async (req, res) => {
  try {
    const { employeeId } = req.params;
    const query = mongoose.Types.ObjectId.isValid(employeeId)
      ? { employeeId: new mongoose.Types.ObjectId(employeeId) }
      : { employeeId };
    const notes = await Note.find(query).sort({ createdAt: -1 }).limit(50);
    res.json({ success: true, notes });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// ── Resignations ────────────────────────────────────────────────────────────

export const submitResignation = async (req, res) => {
  try {
    const { employeeId, resignationDate, lastWorkingDay, reason, comments } = req.body;
    
    if (!employeeId || !resignationDate || !reason) {
      return res.status(400).json({ success: false, message: 'Required fields are missing.' });
    }
    
    if (!mongoose.Types.ObjectId.isValid(employeeId)) {
      return res.status(400).json({ success: false, message: 'Invalid employee ID.' });
    }
    
    // Check if there is already an active resignation
    const existing = await Resignation.findOne({ 
      employeeId: new mongoose.Types.ObjectId(employeeId),
      status: { $in: ['PENDING', 'APPROVED'] }
    });
    
    if (existing) {
      return res.status(400).json({ success: false, message: 'You already have an active resignation request.' });
    }
    
    const payload = {
      employeeId: new mongoose.Types.ObjectId(employeeId),
      resignationDate,
      lastWorkingDay,
      reason,
      comments,
      submittedOn: new Date()
    };
    
    if (req.file) {
      payload.attachment = req.file.path;
    }
    
    const resignation = await Resignation.create(payload);
    res.json({ success: true, resignation });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

export const getMyResignations = async (req, res) => {
  try {
    const { employeeId } = req.params;
    const query = mongoose.Types.ObjectId.isValid(employeeId)
      ? { employeeId: new mongoose.Types.ObjectId(employeeId) }
      : { employeeId };
      
    const resignations = await Resignation.find(query).sort({ submittedOn: -1 });
    res.json({ success: true, resignations });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

export const getResignationById = async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ success: false, message: 'Invalid resignation ID.' });
    }
    
    const resignation = await Resignation.findById(id).populate('employeeId', 'fullName empCode email department role profileImage');
    if (!resignation) {
      return res.status(404).json({ success: false, message: 'Resignation not found.' });
    }
    
    res.json({ success: true, resignation });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};
