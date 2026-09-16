/**
 * Centralized Attendance Calculator & Validator Module
 * Source of truth for attendance status, work hours calculation, timer persistence, and status validation.
 */
import { ATTENDANCE_CONFIG } from '../config/attendanceConfig.js';

export { ATTENDANCE_CONFIG };

// Helper to convert Date object or Date string to HH:MM in Asia/Kolkata timezone
export const getTimeStringIST = (dateObj) => {
  if (!dateObj) return null;
  const d = new Date(dateObj);
  if (isNaN(d.getTime())) return null;
  const tzStr = d.toLocaleString('en-US', { timeZone: 'Asia/Kolkata', hour12: false });
  const timePart = tzStr.split(', ')[1] || tzStr;
  const [h, m] = timePart.split(':');
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
};

// Helper to get local date string YYYY-MM-DD in Asia/Kolkata
export const getTodayDateIST = () => {
  const now = new Date();
  const tzStr = now.toLocaleString('en-US', { timeZone: 'Asia/Kolkata' });
  const localDate = new Date(tzStr);
  const year = localDate.getFullYear();
  const month = String(localDate.getMonth() + 1).padStart(2, '0');
  const day = String(localDate.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};


/**
 * Format seconds as "HHh MMm" (e.g. 03h 42m, 08h 15m)
 */
export const formatTimerHHMM = (seconds) => {
  const totalMins = Math.floor(Math.max(0, seconds) / 60);
  const h = Math.floor(totalMins / 60);
  const m = totalMins % 60;
  return `${String(h).padStart(2, '0')}h ${String(m).padStart(2, '0')}m`;
};

/**
 * Robustly parses date string (YYYY-MM-DD) and time string ("09:38", "09:38 AM", "01:38 PM", "18:39", "00:00")
 * into a Date instance in Asia/Kolkata offset (+05:30).
 */
export const parseTimeToDate = (dateStr, timeStr, isCheckOut = false) => {
  if (!timeStr || !dateStr) return null;
  const str = String(timeStr).trim();
  if (str === '' || str === '--:--' || str === 'null' || str === 'undefined' || str === '—' || str === '--' || str === '--:-- --') return null;

  let hours = 0;
  let minutes = 0;

  const ampmMatch = str.match(/^(\d{1,2}):(\d{2})(?::\d{2})?\s*(AM|PM)?$/i);
  if (ampmMatch) {
    let h = parseInt(ampmMatch[1], 10);
    const m = parseInt(ampmMatch[2], 10);
    const period = ampmMatch[3] ? ampmMatch[3].toUpperCase() : null;

    if (h === 0) {
      hours = 0;
    } else if (period === 'PM' && h < 12) {
      hours = h + 12;
    } else if (period === 'AM' && h === 12) {
      hours = 0;
    } else {
      hours = h;
    }
    minutes = m;
  } else {
    const parsed = new Date(str);
    if (!isNaN(parsed.getTime())) return parsed;
    return null;
  }

  const cleanDateStr = String(dateStr).split('T')[0];
  const parts = cleanDateStr.split('-');
  if (parts.length < 3) return null;
  const y = parseInt(parts[0], 10);
  const m = parseInt(parts[1], 10);
  const d = parseInt(parts[2], 10);

  const pad = (n) => String(n).padStart(2, '0');
  const isoStr = `${y}-${pad(m)}-${pad(d)}T${pad(hours)}:${pad(minutes)}:00+05:30`;
  return new Date(isoStr);
};

/**
 * Legacy helper for backwards compatibility.
 */
export const calculateWorkHours = (checkIn, checkOut, dateStr) => {
  if (!checkIn) return '00h 00m';
  const calc = calculateAttendanceStatus({ checkIn, checkOut, date: dateStr });
  return calc.workHours;
};

/**
 * Centralized Attendance Calculator & Validator
 * Source of truth for working seconds, overtime, lunch breaks, and approval status.
 */
export const calculateAttendanceStatus = (record = {}, context = {}) => {
  const { date, checkIn, checkOut } = record;
  let { checkInApprovalStatus, exceptionType } = record;
  
  if (!checkInApprovalStatus) checkInApprovalStatus = 'Not Required';
  if (!exceptionType) exceptionType = 'None';

  const isHoliday = !!context.isHoliday;
  const isSunday = context.isSunday !== undefined ? context.isSunday : (date ? new Date(date).getDay() === 0 : false);
  const isLeave = !!context.isLeave;
  const currentTime = context.currentTime || new Date();

  // RULE 1 & 2: Leave / Holiday / Sunday rules & No check-in
  if (!checkIn) {
    let status = 'Absent';
    if (isLeave) {
      status = context.leaveType ? context.leaveType : 'Paid Leave';
    } else if (isHoliday) {
      status = 'Holiday';
    } else if (isSunday) {
      status = 'Weekend';
    }
    return {
      status,
      liveStateText: isHoliday ? 'Holiday' : isSunday ? 'Weekend' : isLeave ? 'On Leave' : 'Not Checked In',
      workHours: isHoliday ? 'Holiday' : isSunday ? 'Weekend' : '00h 00m',
      overtime: '00h 00m',
      workingSeconds: 0,
      overtimeSeconds: 0,
      targetSeconds: ATTENDANCE_CONFIG.WORK_TARGET_MINUTES * 60,
      isOnLunchBreak: false,
      isShiftCompleted: false,
      shouldAutoCheckout: false,
      autoCheckoutTime: null,
      isLate: false,
      lateMinutes: 0,
      checkInApprovalStatus: 'Not Required',
      exceptionType: 'None'
    };
  }

  // Parse check-in time
  const checkInDate = new Date(checkIn);
  if (isNaN(checkInDate.getTime())) {
    return {
      status: 'Absent',
      liveStateText: 'Not Checked In',
      workHours: '00h 00m',
      overtime: '00h 00m',
      workingSeconds: 0,
      overtimeSeconds: 0,
      targetSeconds: ATTENDANCE_CONFIG.WORK_TARGET_MINUTES * 60,
      isOnLunchBreak: false,
      isShiftCompleted: false,
      shouldAutoCheckout: false,
      autoCheckoutTime: null,
      isLate: false,
      lateMinutes: 0,
      checkInApprovalStatus: 'Not Required',
      exceptionType: 'None'
    };
  }

  const checkInTimeStr = getTimeStringIST(checkInDate) || '00:00';
  const [cHour, cMin] = checkInTimeStr.split(':').map(Number);
  const currentTotalMins = cHour * 60 + cMin;
  const thresholdMins = 9 * 60 + 30; // Official late threshold: 09:30 AM
  const lateMinutes = Math.max(0, currentTotalMins - thresholdMins);
  const isLateCheckIn = currentTotalMins >= thresholdMins; // Late starts at 09:30 (inclusive)

  // Evaluation timestamp: if checkout exists, evaluate up to checkOut; else up to currentTime
  const isCheckedOut = !!checkOut;
  let evalTime = isCheckedOut ? new Date(checkOut) : currentTime;

  // Construct Lunch window boundaries (13:30 to 14:15)
  const y = checkInDate.getFullYear();
  const m = checkInDate.getMonth();
  const d = checkInDate.getDate();

  const [lStartH, lStartM] = (ATTENDANCE_CONFIG.LUNCH_START || '13:30').split(':').map(Number);
  const [lEndH, lEndM] = (ATTENDANCE_CONFIG.LUNCH_END || '14:15').split(':').map(Number);

  const lunchStart = new Date(y, m, d, lStartH, lStartM, 0);
  const lunchEnd = new Date(y, m, d, lEndH, lEndM, 0);

  // Active working seconds calculations (excluding lunch window)
  let secBeforeLunch = 0;
  if (checkInDate < lunchStart) {
    const endBefore = new Date(Math.min(evalTime.getTime(), lunchStart.getTime()));
    if (endBefore > checkInDate) {
      secBeforeLunch = Math.floor((endBefore.getTime() - checkInDate.getTime()) / 1000);
    }
  }

  let secAfterLunch = 0;
  if (evalTime > lunchEnd) {
    const startAfter = new Date(Math.max(checkInDate.getTime(), lunchEnd.getTime()));
    if (evalTime > startAfter) {
      secAfterLunch = Math.floor((evalTime.getTime() - startAfter.getTime()) / 1000);
    }
  }

  const rawWorkedSeconds = Math.max(0, secBeforeLunch + secAfterLunch);
  const targetSeconds = (ATTENDANCE_CONFIG.WORK_TARGET_MINUTES || 495) * 60; // 29700 seconds (8h 15m)
  const maxOvertimeSeconds = (ATTENDANCE_CONFIG.MAX_OVERTIME_MINUTES || 60) * 60; // 3600 seconds (1h)

  const workingSeconds = Math.min(rawWorkedSeconds, targetSeconds);
  const rawOvertimeSeconds = Math.max(0, rawWorkedSeconds - targetSeconds);
  // We keep overtime calculated exactly based on rawWorkedSeconds, even if it goes high. 
  // However, the original code had a maxOvertimeSeconds cap. We'll leave that in place since it wasn't requested to remove.
  const overtimeSeconds = Math.min(rawOvertimeSeconds, maxOvertimeSeconds);

  const isOnLunchBreak = !isCheckedOut && evalTime >= lunchStart && evalTime < lunchEnd && checkInDate < lunchEnd;
  const isShiftCompleted = rawWorkedSeconds >= targetSeconds;

  const workHoursStr = formatTimerHHMM(workingSeconds);
  const overtimeStr = formatTimerHHMM(overtimeSeconds);

  // Determine exception type
  let calculatedExceptionType = exceptionType;
  if (checkInTimeStr >= '13:30' || (isCheckedOut && rawWorkedSeconds > 0 && rawWorkedSeconds < targetSeconds)) {
    calculatedExceptionType = 'Half Day';
  } else if (isLateCheckIn) {
    calculatedExceptionType = 'Late';
  }

  // Live state text for UI
  let liveStateText = 'Working';
  if (checkInApprovalStatus === 'Pending') {
    liveStateText = 'Approval Pending';
  } else if (checkInApprovalStatus === 'Rejected') {
    liveStateText = 'Check-In Rejected';
  } else if (isCheckedOut) {
    liveStateText = 'Checked Out';
  } else if (isOnLunchBreak) {
    liveStateText = 'Lunch Break';
  } else if (isShiftCompleted) {
    liveStateText = overtimeSeconds > 0 ? 'Overtime' : 'Shift Completed';
  }

  // Handle Approval Pending / Rejected statuses
  if (checkInApprovalStatus === 'Pending') {
    let pendingStatus = 'Present';
    if (checkInTimeStr >= '13:30') {
      pendingStatus = 'Half Day';
    } else if (isLateCheckIn) {
      pendingStatus = 'Late';
    }
    return {
      status: pendingStatus,
      liveStateText,
      workHours: workHoursStr,
      overtime: overtimeStr,
      workingSeconds,
      overtimeSeconds,
      targetSeconds,
      isOnLunchBreak,
      isShiftCompleted,
      isLate: isLateCheckIn,
      lateMinutes,
      checkInApprovalStatus: 'Pending',
      exceptionType: calculatedExceptionType !== 'None' ? calculatedExceptionType : (exceptionType || 'Late')
    };
  }

  if (checkInApprovalStatus === 'Rejected') {
    return {
      status: 'Absent',
      liveStateText,
      workHours: workHoursStr,
      overtime: overtimeStr,
      workingSeconds,
      overtimeSeconds,
      targetSeconds,
      isOnLunchBreak: false,
      isShiftCompleted: false,
      isLate: isLateCheckIn,
      lateMinutes,
      checkInApprovalStatus: 'Rejected',
      exceptionType: calculatedExceptionType
    };
  }

  // Centralized Thresholds for Attendance Classification:
  // ABSENT_THRESHOLD_MINUTES = 240 (4 Hours)
  // FULL_DAY_THRESHOLD_MINUTES = 495 (8 Hours 15 Minutes)
  const workingMinutes = Math.floor(rawWorkedSeconds / 60);
  const absentThreshold = ATTENDANCE_CONFIG.ABSENT_THRESHOLD_MINUTES ?? 240;
  const fullDayThreshold = ATTENDANCE_CONFIG.FULL_DAY_THRESHOLD_MINUTES ?? 495;

  let status = 'Present';
  if (isCheckedOut) {
    // After checkout: classify by hours worked, apply Late if late check-in with full day
    if (workingMinutes < absentThreshold) {
      status = 'Absent';
    } else if (workingMinutes < fullDayThreshold) {
      status = 'Half Day';
    } else {
      // Full day worked — Late if checked in after 09:30, else Present
      status = isLateCheckIn ? 'Late' : 'Present';
    }
  } else {
    // Still checked in (live session) — classify by check-in time
    if (checkInTimeStr >= '13:30') {
      status = 'Half Day'; // checked in after 1:30 PM
    } else if (isLateCheckIn) {
      status = 'Late'; // checked in after 09:30 AM
    } else {
      status = 'Present'; // on time
    }
  }

  return {
    status,
    liveStateText,
    workHours: workHoursStr,
    overtime: overtimeStr,
    workingSeconds,
    overtimeSeconds,
    targetSeconds,
    isOnLunchBreak,
    isShiftCompleted,
    isLate: isLateCheckIn,
    lateMinutes,
    checkInApprovalStatus,
    exceptionType: calculatedExceptionType
  };
};

/**
 * Validates whether an admin's requested attendance status change is consistent with check-in/check-out times.
 */
export const validateAdminStatusUpdate = (requestedStatus, checkIn, checkOut) => {
  const hasCheckIn = !!checkIn && !isNaN(new Date(checkIn).getTime());
  const hasCheckOut = !!checkOut && !isNaN(new Date(checkOut).getTime());

  if (requestedStatus === 'Present') {
    if (!hasCheckIn) {
      return {
        isValid: false,
        message: 'Attendance status cannot be set to Present without a valid Check-in time. Please provide Check-in time.'
      };
    }
    
    // Only calculate and check duration if checkOut is also provided
    if (hasCheckIn && hasCheckOut) {
      const cIn = new Date(checkIn);
      const cOut = new Date(checkOut);
      const outTimeStr = getTimeStringIST(cOut);
      if (outTimeStr === '00:00') {
        const checkInTimeStr = getTimeStringIST(cIn);
        if (checkInTimeStr >= '13:30') {
          return {
            isValid: false,
            message: 'Check-in time is at or after 13:30. Cannot set status to Present with 00:00 checkout for afternoon check-in.'
          };
        }
        return { isValid: true, message: '' };
      }

      let diffMs = cOut.getTime() - cIn.getTime();
      const mins = Math.floor(diffMs / (1000 * 60));
      
      if (diffMs < 0) {
        return {
          isValid: false,
          message: 'Check-out time must be after Check-in time.'
        };
      }

      if (mins < 495) { // < 8h 15m
        return {
          isValid: false,
          message: `Attendance status cannot be set to Present because the total working duration (${Math.floor(mins/60)}h ${mins%60}m) is less than 8 hours 15 minutes (495 minutes). Please update Check-in and/or Check-out time.`
        };
      }
    }
  }

  if (requestedStatus === 'Late') {
    if (!hasCheckIn) {
      return {
        isValid: false,
        message: 'Attendance status cannot be changed to Late without a valid Check-in time. Please update Check-in time.'
      };
    }
    const checkInTimeStr = getTimeStringIST(checkIn);
    if (checkInTimeStr && checkInTimeStr <= '09:30') {
      return {
        isValid: false,
        message: 'Check-in time is on or before 09:30 AM. Cannot set status to Late without a late Check-in time.'
      };
    }
  }

  if (requestedStatus === 'Half Day') {
    if (!hasCheckIn && !hasCheckOut) {
      return {
        isValid: false,
        message: 'Attendance status cannot be changed to Half Day without setting Check-in and/or Check-out time.'
      };
    }
  }

  return { isValid: true, message: '' };
};
