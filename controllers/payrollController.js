import Payroll      from '../models/Payroll.js';
import Attendance   from '../models/Attendance.js';
import LeaveRequest from '../models/LeaveRequest.js';
import Holiday      from '../models/Holiday.js';
import Employee     from '../models/Employee.js';
import SystemSetting from '../models/SystemSetting.js';
import mongoose     from 'mongoose';

// ─── Payroll Cycle Helper ─────────────────────────────────────────────────────
/**
 * Given a payroll month (1-12) and year, returns the attendance window:
 *   periodStart: 21st of the PREVIOUS month  ("YYYY-MM-DD")
 *   periodEnd:   20th of the CURRENT month   ("YYYY-MM-DD")
 *
 * Example: month=7, year=2026  →  2026-06-21 … 2026-07-20
 */
const getPayrollPeriod = (month, year) => {
  let prevMonth = month - 1;
  let prevYear  = year;
  if (prevMonth === 0) { prevMonth = 12; prevYear = year - 1; }
  const pad = (n) => String(n).padStart(2, '0');
  return {
    periodStart: `${prevYear}-${pad(prevMonth)}-21`,
    periodEnd:   `${year}-${pad(month)}-20`,
  };
};

// ─── Date Helpers ─────────────────────────────────────────────────────────────
/** Count total calendar days in range (inclusive). */
const countDaysInRange = (startStr, endStr) => {
  const start = new Date(startStr + 'T00:00:00');
  const end   = new Date(endStr   + 'T00:00:00');
  return Math.round((end - start) / 86400000) + 1;
};

/** Count Sundays in range (inclusive). */
const countSundaysInRange = (startStr, endStr) => {
  let count = 0;
  const cur = new Date(startStr + 'T00:00:00');
  const end = new Date(endStr   + 'T00:00:00');
  while (cur <= end) {
    if (cur.getDay() === 0) count++;
    cur.setDate(cur.getDate() + 1);
  }
  return count;
};

/**
 * Build a Set of all dates (YYYY-MM-DD strings) that are Sundays in the range.
 * Used to skip Sunday attendance rows.
 */
const buildSundaySet = (startStr, endStr) => {
  const set = new Set();
  const cur = new Date(startStr + 'T00:00:00');
  const end = new Date(endStr   + 'T00:00:00');
  while (cur <= end) {
    if (cur.getDay() === 0) {
      const y = cur.getFullYear();
      const m = String(cur.getMonth() + 1).padStart(2, '0');
      const d = String(cur.getDate()).padStart(2, '0');
      set.add(`${y}-${m}-${d}`);
    }
    cur.setDate(cur.getDate() + 1);
  }
  return set;
};

const toWords = (amount) => {
  if (amount === 0) return 'Zero Rupees Only';
  const ones = ['','One','Two','Three','Four','Five','Six','Seven','Eight','Nine','Ten',
    'Eleven','Twelve','Thirteen','Fourteen','Fifteen','Sixteen','Seventeen','Eighteen','Nineteen'];
  const tens = ['','','Twenty','Thirty','Forty','Fifty','Sixty','Seventy','Eighty','Ninety'];
  const convert = (n) => {
    if (n < 20)       return ones[n];
    if (n < 100)      return tens[Math.floor(n/10)] + (n%10 ? ' '+ones[n%10] : '');
    if (n < 1000)     return ones[Math.floor(n/100)] + ' Hundred' + (n%100 ? ' '+convert(n%100) : '');
    if (n < 100000)   return convert(Math.floor(n/1000)) + ' Thousand' + (n%1000 ? ' '+convert(n%1000) : '');
    if (n < 10000000) return convert(Math.floor(n/100000)) + ' Lakh' + (n%100000 ? ' '+convert(n%100000) : '');
    return convert(Math.floor(n/10000000)) + ' Crore' + (n%10000000 ? ' '+convert(n%10000000) : '');
  };
  return convert(Math.floor(amount)) + ' Rupees Only';
};

// ─── Core Attendance Calculator ───────────────────────────────────────────────
/**
 * Calculates every attendance stat for the given employee + payroll period.
 * All data comes from MongoDB — nothing is hardcoded.
 *
 * Returns:
 * {
 *   payrollPeriod: { from, to },
 *   workingDays, present, absent, halfDay,
 *   paidLeave, unpaidLeave, weeklyOff, holidays,
 *   lateMarks, payableDays
 * }
 */
const calcAttendanceSummary = async (employeeId, monthNum, yearNum) => {
  const { periodStart, periodEnd } = getPayrollPeriod(monthNum, yearNum);

  // ── 1. Fetch late threshold from SystemSettings (default 09:40) ─────────────
  const lateSettingDoc = await SystemSetting.findOne({ key: 'late_threshold' });
  const lateThreshold  = (lateSettingDoc?.value || '09:40').toString();

  // ── 2. Fetch holidays in the period ─────────────────────────────────────────
  const holidayDocs = await Holiday.find({
    holidayDate: { $gte: periodStart, $lte: periodEnd },
    isHoliday:   true
  });

  // Build a set of non-Sunday holiday date strings for fast lookup
  const holidayDateSet   = new Set();
  let   nonSundayHolidays = 0;

  holidayDocs.forEach(h => {
    const dateStr = typeof h.holidayDate === 'string'
      ? h.holidayDate.slice(0, 10)
      : new Date(h.holidayDate).toISOString().slice(0, 10);
    const day = new Date(dateStr + 'T00:00:00').getDay();
    if (day !== 0) {          // not Sunday
      holidayDateSet.add(dateStr);
      nonSundayHolidays++;
    }
  });

  // Total holiday count (including those on Sundays, for display)
  const totalHolidayCount = holidayDocs.length;

  // ── 3. Build Sunday set for the period ──────────────────────────────────────
  const sundaySet  = buildSundaySet(periodStart, periodEnd);
  const weeklyOffs = sundaySet.size;

  // ── 4. Working days = (Mon–Sat) minus non-Sunday holidays ───────────────────
  const totalCalDays  = countDaysInRange(periodStart, periodEnd);
  let totalWorkingDays = totalCalDays - weeklyOffs - nonSundayHolidays;

  // ── 5 & 6. Aggregate attendance — deduplicate by date at DB level ────────────
  // For duplicate records on the same date, sort ensures 'Half Day' < 'Holiday' < 'Late' < 'Present' < 'Weekend'
  // so $first picks the most-specific status for each date.
  const empObjId = mongoose.Types.ObjectId.isValid(employeeId)
    ? new mongoose.Types.ObjectId(employeeId)
    : employeeId;

  const attAgg = await Attendance.aggregate([
    {
      $match: {
        employeeId: empObjId,
        date:       { $gte: periodStart, $lte: periodEnd },
      },
    },
    // Sort: newest update first so admin changes override earlier check-ins
    // When a date has duplicates, $first will pick the most recently updated status
    { $sort: { date: 1, updatedAt: -1 } },
    // De-duplicate: keep one record per date (the newest one after sort)
    {
      $group: {
        _id:    '$date',
        status: { $first: '$status' },
        isLate: { $first: '$isLate' },
      },
    },
    // Filter out Sundays (already counted as weekly-offs)
    { $match: { _id: { $nin: [...sundaySet] } } },
    // Count every status — including manually-set ones
    {
      $group: {
        _id:          null,
        present:      { $sum: { $cond: [{ $in: ['$status', ['Present', 'Late']] }, 1, 0] } },
        halfDay:      { $sum: { $cond: [{ $eq: ['$status', 'Half Day']    }, 1, 0] } },
        absent:       { $sum: { $cond: [{ $eq: ['$status', 'Absent']      }, 1, 0] } },
        paidLeaveAtt: { $sum: { $cond: [{ $eq: ['$status', 'Paid Leave']  }, 1, 0] } },
        unpaidLeaveAtt:{ $sum: { $cond: [{ $eq: ['$status', 'Unpaid Leave']}, 1, 0] } },
        holidays:     { $sum: { $cond: [{ $eq: ['$status', 'Holiday']     }, 1, 0] } },
        weekends:     { $sum: { $cond: [{ $eq: ['$status', 'Weekend']     }, 1, 0] } },
        lateMarks: {
          $sum: {
            $cond: [
              { $or: [{ $eq: ['$status', 'Late'] }, { $eq: ['$isLate', true] }] },
              1, 0,
            ],
          },
        },
      },
    },
  ]);

  const attStats           = attAgg[0] || {};
  const present            = attStats.present       || 0;
  const halfDay            = attStats.halfDay        || 0;
  const absentFromAtt      = attStats.absent         || 0;
  const paidLeaveFromAtt   = attStats.paidLeaveAtt   || 0;
  const unpaidLeaveFromAtt = attStats.unpaidLeaveAtt || 0;
  const attendanceHolidays = attStats.holidays       || 0;
  const attendanceWeekends = attStats.weekends       || 0;
  const lateMarks          = attStats.lateMarks      || 0;

  // ── 7. Fetch approved leaves from LeaveRequest model ─────────────────────────
  const leaveDocs = await LeaveRequest.find({
    employeeId: empObjId,
    status:     'APPROVED',
    fromDate:   { $lte: periodEnd },
    toDate:     { $gte: periodStart },
  }).lean();

  const PAID_LEAVE_TYPES = ['Casual Leave', 'Sick Leave', 'Paid Leave'];

  let paidLeaveFromReq   = 0;
  let unpaidLeaveFromReq = 0;

  leaveDocs.forEach(l => {
    const lStart = l.fromDate > periodStart ? l.fromDate : periodStart;
    const lEnd   = l.toDate   < periodEnd   ? l.toDate   : periodEnd;
    const days   = countDaysInRange(lStart, lEnd);
    if (days <= 0) return;
    if (PAID_LEAVE_TYPES.includes(l.leaveType)) paidLeaveFromReq   += days;
    else                                         unpaidLeaveFromReq += days;
  });

  // Merge attendance-based and LeaveRequest-based leaves.
  // Use Math.max to avoid double-counting when admin marks both.
  const paidLeave   = Math.max(paidLeaveFromAtt,   paidLeaveFromReq);
  const unpaidLeave = Math.max(unpaidLeaveFromAtt, unpaidLeaveFromReq);

  // ── 8. Effective counts ───────────────────────────────────────────────────────
  // Holidays: prefer Holiday-model entries, fall back to attendance-sourced
  const effectiveHolidays   = Math.max(nonSundayHolidays, attendanceHolidays);
  const effectiveWeeklyOffs = weeklyOffs + attendanceWeekends;

  // Working days: total calendar minus Sundays and minus Holidays (treated as non-working days)
  totalWorkingDays = Math.max(0, totalCalDays - effectiveWeeklyOffs - effectiveHolidays);

  // ── 9. Absent = working days not covered by any positive status ───────────────
  // Only count days up to today — don't mark future unrecorded days as absent
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // Count past working days (excluding weekends) up to today
  let pastWorkingDays = 0;
  let pastGlobalHolidays = 0;
  
  const cur2 = new Date(periodStart + 'T00:00:00');
  const periodEndDate = new Date(periodEnd + 'T00:00:00');
  const effectiveEnd = today < periodEndDate ? today : periodEndDate;
  while (cur2 <= effectiveEnd) {
    const isSun2 = cur2.getDay() === 0;
    const y = cur2.getFullYear();
    const m = String(cur2.getMonth() + 1).padStart(2, '0');
    const d = String(cur2.getDate()).padStart(2, '0');
    const dateStr2 = `${y}-${m}-${d}`;
    
    if (!isSun2) {
      pastWorkingDays++;
      if (holidayDateSet.has(dateStr2)) {
        pastGlobalHolidays++;
      }
    }
    cur2.setDate(cur2.getDate() + 1);
  }

  // Explicitly-absent records + truly unmarked past working days
  // We use pastEffectiveHolidays because future holidays shouldn't artificially reduce today's unmarked absences
  const pastEffectiveHolidays = Math.max(pastGlobalHolidays, attendanceHolidays);
  const accounted   = present + halfDay + paidLeave + unpaidLeave + absentFromAtt + pastEffectiveHolidays;
  const unmarked    = Math.max(0, pastWorkingDays - accounted);
  const totalAbsent = absentFromAtt + unmarked;


  // ── 10. Payable days ──────────────────────────────────────────────────────────
  // ONLY present + paidLeave + halfDay×0.5 (Holidays are excluded from working days, so they are not payable days either)
  const rawPayable  = present + paidLeave + (halfDay * 0.5);
  const maxPayable = Math.max(0, totalCalDays - effectiveWeeklyOffs);
  const payableDays = Math.min(Math.round(rawPayable * 10) / 10, maxPayable);

  return {
    payrollPeriod: { from: periodStart, to: periodEnd },
    workingDays:   totalWorkingDays,
    present,
    absent:        totalAbsent,
    halfDay,
    paidLeave,
    unpaidLeave,
    weeklyOff:     effectiveWeeklyOffs,
    holidays:      effectiveHolidays,
    lateMarks,
    payableDays,
    // internal helpers used by preview & generate
    _periodStart:  periodStart,
    _periodEnd:    periodEnd,
  };
};

// ─── ATTENDANCE SUMMARY ───────────────────────────────────────────────────────
// GET /api/payroll/attendance-summary/:employeeId/:month/:year
// Always reads live data — never returns cached / stored values
// export const getAttendanceSummary = async (req, res) => {
//   try {
//     const { employeeId, month, year } = req.params;
//     const monthNum = parseInt(month, 10);
//     const yearNum  = parseInt(year,  10);

//     const summary = await calcAttendanceSummary(employeeId, monthNum, yearNum);

//     return res.json({ success: true, data: summary });
//   } catch (err) {
//     console.error('getAttendanceSummary error:', err);
//     res.status(500).json({ success: false, message: 'Server error calculating attendance summary' });
//   }
// };



export const getAttendanceSummary = async (req, res) => {
  try {
    const { employeeId, month, year } = req.params;

    const monthNum = parseInt(month, 10);
    const yearNum = parseInt(year, 10);

    const summary = await calcAttendanceSummary(
      employeeId,
      monthNum,
      yearNum
    );

    return res.json({
      success: true,
      payrollPeriod: summary.payrollPeriod,
      data: summary,
    });
  } catch (err) {
    console.error("getAttendanceSummary error:", err);
    res.status(500).json({
      success: false,
      message: "Server error calculating attendance summary",
    });
  }
};

// ─── ATTENDANCE SUMMARY FOR ALL EMPLOYEES ─────────────────────────────────────
// GET /api/payroll/attendance-summary-all/:month/:year
export const getAttendanceSummaryAll = async (req, res) => {
  try {
    const { month, year } = req.params;
    const monthNum = parseInt(month, 10);
    const yearNum = parseInt(year, 10);

    const employees = await Employee.find({ status: 'Active' });
    const summaries = await Promise.all(
      employees.map(async (emp) => {
        const summary = await calcAttendanceSummary(emp._id, monthNum, yearNum);
        return {
          employee: {
            _id: emp._id,
            empCode: emp.empCode,
            fullName: emp.fullName,
            department: emp.department,
          },
          summary,
        };
      })
    );

    const { periodStart, periodEnd } = getPayrollPeriod(monthNum, yearNum);

    return res.json({
      success: true,
      payrollPeriod: { periodStart, periodEnd },
      data: summaries,
    });
  } catch (err) {
    console.error("getAttendanceSummaryAll error:", err);
    res.status(500).json({
      success: false,
      message: "Server error calculating attendance summary for all employees",
    });
  }
};

// ─── GET PAYROLL PREVIEW / EXISTING ──────────────────────────────────────────
// GET /api/payroll/:employeeId/:month/:year
export const getPayrollPreview = async (req, res) => {
  try {
    const { employeeId, month, year } = req.params;
    const monthNum = parseInt(month, 10);
    const yearNum  = parseInt(year,  10);
    const { periodStart, periodEnd } = getPayrollPeriod(monthNum, yearNum);

    // ── If payroll already generated, return locked record ───────────────────
    const existing = await Payroll.findOne({ employeeId, month: monthNum, year: yearNum })
      .populate('generatedBy', 'fullName');
    if (existing) {
      return res.json({
        success:      true,
        data:         existing,
        isGenerated:  true,
        payrollPeriod: { periodStart, periodEnd },
      });
    }

    // ── Calculate live attendance summary ────────────────────────────────────
    const summary = await calcAttendanceSummary(employeeId, monthNum, yearNum);

    return res.json({
      success:          true,
      isGenerated:      false,
      hasAttendanceData: summary.present > 0 || summary.halfDay > 0,
      payrollPeriod:    { periodStart, periodEnd },
      data: {
        employeeId,
        month:       monthNum,
        year:        yearNum,
        periodStart: summary._periodStart,
        periodEnd:   summary._periodEnd,
        // Attendance stats
        workingDays:  summary.workingDays,
        presentDays:  summary.present,
        absentDays:   summary.absent,
        halfDays:     summary.halfDay,
        paidLeaves:   summary.paidLeave,
        unpaidLeaves: summary.unpaidLeave,
        weeklyOffs:   summary.weeklyOff,
        holidays:     summary.holidays,
        lateMarks:    summary.lateMarks,
        payableDays:  summary.payableDays,
      },
    });
  } catch (err) {
    console.error('getPayrollPreview error:', err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

// ─── GENERATE PAYROLL ─────────────────────────────────────────────────────────
// POST /api/payroll/generate
export const generatePayroll = async (req, res) => {
  try {
    const {
      employeeId, month, year,
      basicSalary,
      workingDays, presentDays, absentDays, halfDays,
      paidLeaves, unpaidLeaves, weeklyOffs, holidays, lateMarks, payableDays,
      // Allowances
      hra = 0, medicalAllowance = 0, travelAllowance = 0, foodAllowance = 0,
      specialAllowance = 0, bonus = 0, overtime = 0, otherEarnings = 0,
      // Deductions
      professionalTax = 0, pf = 0, esi = 0, tds = 0,
      advance = 0, loan = 0, penalty = 0, lateFine = 0, otherDeductions = 0,
      adminId,
    } = req.body;

    const existing = await Payroll.findOne({ employeeId, month, year });
    if (existing) {
      return res.status(400).json({
        success: false,
        message: 'Payroll already generated for this cycle. Delete first to regenerate.',
      });
    }

    // Always re-fetch live attendance at generate time to ensure accuracy
    const live = await calcAttendanceSummary(employeeId, parseInt(month), parseInt(year));
    const { _periodStart: periodStart, _periodEnd: periodEnd } = live;

    // Use live stats (ignore anything the frontend might have sent for attendance fields)
    const liveWorkingDays  = live.workingDays;
    const livePresentDays  = live.present;
    const liveAbsentDays   = live.absent;
    const liveHalfDays     = live.halfDay;
    const livePaidLeaves   = live.paidLeave;
    const liveUnpaidLeaves = live.unpaidLeave;
    const liveWeeklyOffs   = live.weeklyOff;
    const liveHolidays     = live.holidays;
    const liveLateMarks    = live.lateMarks;
    const livePayableDays  = live.payableDays;

    const emp = await Employee.findById(employeeId);

    // ── Salary Calculations ───────────────────────────────────────────────────
    const perDaySalary         = liveWorkingDays > 0 ? basicSalary / liveWorkingDays : 0;
    const presentSalary        = livePresentDays * perDaySalary;
    const halfDaySalary        = liveHalfDays * (perDaySalary / 2);
    const paidLeaveSalary      = livePaidLeaves * perDaySalary;

    const absentDeduction      = liveAbsentDays  * perDaySalary;
    const unpaidLeaveDeduction = liveUnpaidLeaves * perDaySalary;
    const halfDayDeduction     = liveHalfDays    * (perDaySalary / 2);

    const totalAllowances =
      Number(hra) + Number(medicalAllowance) + Number(travelAllowance) +
      Number(foodAllowance) + Number(specialAllowance) + Number(bonus) +
      Number(overtime) + Number(otherEarnings);

    const grossSalary    = basicSalary + totalAllowances;
    const attendanceDeds = absentDeduction + unpaidLeaveDeduction + halfDayDeduction;
    const extraDeds      =
      Number(professionalTax) + Number(pf) + Number(esi) + Number(tds) +
      Number(advance) + Number(loan) + Number(penalty) + Number(lateFine) + Number(otherDeductions);
    const totalDeductions = attendanceDeds + extraDeds;
    const netSalary       = Math.max(0, grossSalary - totalDeductions);
    const amountInWords   = toWords(Math.round(netSalary));

    const newPayroll = await Payroll.create({
      employeeId, month, year,
      periodStart, periodEnd,
      // Employee snapshot
      employeeName:  emp?.fullName,
      employeePhoto: emp?.profileImage,
      employeeCode:  emp?.empCode,
      department:    emp?.department,
      designation:   emp?.role,
      employeeEmail: emp?.email,
      employeePhone: emp?.phone,
      joiningDate:   emp?.joinDate,
      panNumber:     emp?.panNumber,
      aadharNumber:  emp?.aadharNumber,
      bankName:      emp?.bankName,
      accountNumber: emp?.accountNumber,
      ifscCode:      emp?.ifscCode,
      branchName:    emp?.branchName,
      upiId:         emp?.upiId,
      // Attendance (always live values)
      workingDays:  liveWorkingDays,
      presentDays:  livePresentDays,
      absentDays:   liveAbsentDays,
      halfDays:     liveHalfDays,
      paidLeaves:   livePaidLeaves,
      unpaidLeaves: liveUnpaidLeaves,
      weeklyOffs:   liveWeeklyOffs,
      holidays:     liveHolidays,
      lateMarks:    liveLateMarks,
      payableDays:  livePayableDays,
      // Core salary
      basicSalary, perDaySalary,
      // Allowances
      hra, medicalAllowance, travelAllowance, foodAllowance,
      specialAllowance, bonus, overtime, otherEarnings,
      // Earnings
      presentSalary, halfDaySalary, paidLeaveSalary,
      totalEarnings: grossSalary,
      // Deductions
      professionalTax, pf, esi, tds, advance, loan, penalty,
      absentDeduction, unpaidLeaveDeduction, lateFine, otherDeductions,
      totalDeductions,
      // Totals
      grossSalary, netSalary, amountInWords,
      status:      'Generated',
      generatedBy: adminId || undefined,
    });

    res.status(201).json({ success: true, data: newPayroll, message: 'Payroll generated successfully' });
  } catch (err) {
    console.error('generatePayroll error:', err);
    res.status(500).json({ success: false, message: err.message || 'Server error generating payroll' });
  }
};

// ─── UPDATE PDF URL ───────────────────────────────────────────────────────────
// PUT /api/payroll/:id/pdf
export const updatePdfUrl = async (req, res) => {
  try {
    const updated = await Payroll.findByIdAndUpdate(req.params.id, { pdfUrl: req.body.pdfUrl }, { new: true });
    if (!updated) return res.status(404).json({ success: false, message: 'Payroll not found' });
    res.json({ success: true, data: updated });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

// ─── GET HISTORY ──────────────────────────────────────────────────────────────
// GET /api/payroll/history/:employeeId
export const getPayrollHistory = async (req, res) => {
  try {
    const history = await Payroll.find({ employeeId: req.params.employeeId })
      .sort({ year: -1, month: -1 })
      .populate('generatedBy', 'fullName');
    res.json({ success: true, data: history });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

// ─── GET SINGLE SLIP ──────────────────────────────────────────────────────────
// GET /api/payroll/slip/:payrollId
export const getPayrollSlip = async (req, res) => {
  try {
    const payroll = await Payroll.findById(req.params.payrollId)
      .populate('employeeId')
      .populate('generatedBy', 'fullName');
    if (!payroll) return res.status(404).json({ success: false, message: 'Payroll not found' });
    res.json({ success: true, data: payroll });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

// ─── DELETE ───────────────────────────────────────────────────────────────────
// DELETE /api/payroll/:id
export const deletePayroll = async (req, res) => {
  try {
    const payroll = await Payroll.findByIdAndDelete(req.params.id);
    if (!payroll) return res.status(404).json({ success: false, message: 'Payroll not found' });
    res.json({ success: true, message: 'Payroll deleted successfully' });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

// ─── UPDATE ───────────────────────────────────────────────────────────────────
// PUT /api/payroll/update/:id
export const updatePayroll = async (req, res) => {
  try {
    const updated = await Payroll.findByIdAndUpdate(req.params.id, req.body, { new: true });
    if (!updated) return res.status(404).json({ success: false, message: 'Payroll not found' });
    res.json({ success: true, data: updated, message: 'Payroll updated successfully' });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Server error' });
  }
};
