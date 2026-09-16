import mongoose from 'mongoose';
import Employee from '../models/Employee.js';
import LeaveRequest from '../models/LeaveRequest.js';
import LeaveTransaction from '../models/LeaveTransaction.js';

// ─── Helper: Get current earned leave balance for an employee ─────────────────
export const getLeaveBalance = async (employeeId) => {
  const empObjId = new mongoose.Types.ObjectId(employeeId);
  const result = await LeaveTransaction.aggregate([
    { $match: { employeeId: empObjId } },
    { $group: { _id: null, total: { $sum: '$amount' } } }
  ]);
  return result.length > 0 ? result[0].total : 0;
};

// ─── Helper: Process accrual for one employee for one month ──────────────────
const accrueMonthForEmployee = async (employee, accrualMonth, adminId = null) => {
  const empId = employee._id;

  // Check if already processed (guard in addition to unique index)
  const existing = await LeaveTransaction.findOne({
    employeeId: empId,
    accrualMonth,
    transactionType: 'MONTHLY_ACCRUAL'
  });
  if (existing) return { skipped: true, reason: 'Already processed' };

  const currentBalance = await getLeaveBalance(empId.toString());
  const newBalance = currentBalance + 1;

  await LeaveTransaction.create({
    employeeId: empId,
    transactionType: 'MONTHLY_ACCRUAL',
    amount: 1,
    accrualMonth,
    leaveType: 'Earned Leave',
    reason: `Monthly earned leave accrual for ${accrualMonth}`,
    balanceAfterTransaction: newBalance,
    createdBy: adminId ? new mongoose.Types.ObjectId(adminId) : null
  });

  return { accrued: true, month: accrualMonth, newBalance };
};

// ─── GET /api/admin/leaves/accrual/balance/:employeeId ───────────────────────
export const getEmployeeLeaveBalance = async (req, res) => {
  try {
    const { employeeId } = req.params;
    if (!mongoose.Types.ObjectId.isValid(employeeId)) {
      return res.status(400).json({ success: false, message: 'Invalid employee ID' });
    }
    const empObjId = new mongoose.Types.ObjectId(employeeId);

    const earnedAgg = await LeaveTransaction.aggregate([
      { $match: { employeeId: empObjId, transactionType: 'MONTHLY_ACCRUAL' } },
      { $group: { _id: null, total: { $sum: '$amount' } } }
    ]);
    const usedAgg = await LeaveTransaction.aggregate([
      { $match: { employeeId: empObjId, transactionType: 'LEAVE_USED' } },
      { $group: { _id: null, total: { $sum: '$amount' } } }
    ]);
    const adjAgg = await LeaveTransaction.aggregate([
      { $match: { employeeId: empObjId, transactionType: 'ADMIN_ADJUSTMENT' } },
      { $group: { _id: null, total: { $sum: '$amount' } } }
    ]);

    const earned = earnedAgg.length > 0 ? earnedAgg[0].total : 0;
    const used = usedAgg.length > 0 ? Math.abs(usedAgg[0].total) : 0;
    const adjustments = adjAgg.length > 0 ? adjAgg[0].total : 0;
    const available = await getLeaveBalance(employeeId);

    const pendingAgg = await LeaveRequest.aggregate([
      { $match: { employeeId: empObjId, status: 'PENDING' } },
      { $group: { _id: null, total: { $sum: '$days' } } }
    ]);
    const pendingDays = pendingAgg.length > 0 ? pendingAgg[0].total : 0;

    const now = new Date();
    const thisMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    const thisMonthAccrual = await LeaveTransaction.findOne({
      employeeId: empObjId,
      accrualMonth: thisMonth,
      transactionType: 'MONTHLY_ACCRUAL'
    });
    const lastAccrual = await LeaveTransaction.findOne(
      { employeeId: empObjId, transactionType: 'MONTHLY_ACCRUAL' },
      {},
      { sort: { createdAt: -1 } }
    );

    res.json({
      success: true,
      balance: {
        available,
        earned,
        used,
        pendingDays,
        adjustments,
        earnedThisMonth: thisMonthAccrual ? 1 : 0,
        lastAccrualDate: lastAccrual ? lastAccrual.createdAt : null
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// ─── GET /api/employee/leaves/balance/:employeeId ─────────────────────────────
export const getMyLeaveBalance = async (req, res) => {
  try {
    const { employeeId } = req.params;
    if (!mongoose.Types.ObjectId.isValid(employeeId)) {
      return res.status(400).json({ success: false, message: 'Invalid employee ID' });
    }
    const empObjId = new mongoose.Types.ObjectId(employeeId);

    const earnedAgg = await LeaveTransaction.aggregate([
      { $match: { employeeId: empObjId, transactionType: 'MONTHLY_ACCRUAL' } },
      { $group: { _id: null, total: { $sum: '$amount' } } }
    ]);
    const usedAgg = await LeaveTransaction.aggregate([
      { $match: { employeeId: empObjId, transactionType: 'LEAVE_USED' } },
      { $group: { _id: null, total: { $sum: '$amount' } } }
    ]);

    const earned = earnedAgg.length > 0 ? earnedAgg[0].total : 0;
    const usedRaw = usedAgg.length > 0 ? usedAgg[0].total : 0;
    const used = Math.abs(usedRaw);
    const available = await getLeaveBalance(employeeId);

    const pendingAgg = await LeaveRequest.aggregate([
      { $match: { employeeId: empObjId, status: 'PENDING' } },
      { $group: { _id: null, total: { $sum: '$days' } } }
    ]);
    const pendingDays = pendingAgg.length > 0 ? pendingAgg[0].total : 0;

    const now = new Date();
    const thisMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    const thisMonthAccrual = await LeaveTransaction.findOne({
      employeeId: empObjId,
      accrualMonth: thisMonth,
      transactionType: 'MONTHLY_ACCRUAL'
    });

    const recentTransactions = await LeaveTransaction.find({ employeeId: empObjId })
      .sort({ createdAt: -1 })
      .limit(12);

    res.json({
      success: true,
      balance: {
        available,
        earned,
        used,
        pendingDays,
        earnedThisMonth: thisMonthAccrual ? 1 : 0,
        carriedForward: earned  // All accumulated = available + used = earned (before deductions)
      },
      transactions: recentTransactions
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// ─── GET /api/employee/leaves/transactions/:employeeId ───────────────────────
export const getMyLeaveTransactions = async (req, res) => {
  try {
    const { employeeId } = req.params;
    if (!mongoose.Types.ObjectId.isValid(employeeId)) {
      return res.status(400).json({ success: false, message: 'Invalid employee ID' });
    }
    const empObjId = new mongoose.Types.ObjectId(employeeId);
    const transactions = await LeaveTransaction.find({ employeeId: empObjId })
      .sort({ createdAt: -1 })
      .limit(50);
    res.json({ success: true, transactions });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// ─── POST /api/admin/leaves/accrual/process ───────────────────────────────────
// Processes the last completed month for all active employees (safe to re-run)
export const processMonthlyAccrual = async (req, res) => {
  try {
    const adminId = req.body.adminId || null;
    const now = new Date();

    // Process the PREVIOUS completed month
    const targetDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const accrualMonth = `${targetDate.getFullYear()}-${String(targetDate.getMonth() + 1).padStart(2, '0')}`;

    const employees = await Employee.find({ status: 'Active' });
    const results = { processed: 0, skipped: 0, errors: [] };

    for (const emp of employees) {
      const joinDate = new Date(emp.joinDate || emp.createdAt);
      const joinMonth = `${joinDate.getFullYear()}-${String(joinDate.getMonth() + 1).padStart(2, '0')}`;
      if (accrualMonth < joinMonth) {
        results.skipped++;
        continue;
      }
      try {
        const result = await accrueMonthForEmployee(emp, accrualMonth, adminId);
        if (result.skipped) results.skipped++;
        else results.processed++;
      } catch (err) {
        if (err.code === 11000) {
          results.skipped++;
        } else {
          results.errors.push({ employee: emp.empCode, error: err.message });
        }
      }
    }

    res.json({ success: true, accrualMonth, results });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// ─── POST /api/admin/leaves/accrual/backfill ──────────────────────────────────
// Backfills all missing monthly accruals from each employee's join date to last completed month
export const backfillAccruals = async (req, res) => {
  try {
    const adminId = req.body.adminId || null;
    const now = new Date();
    const results = { processed: 0, skipped: 0, errors: [] };

    const employees = await Employee.find({ status: 'Active' });

    for (const emp of employees) {
      const joinDate = new Date(emp.joinDate || emp.createdAt);
      const startYear = joinDate.getFullYear();
      const startMonth = joinDate.getMonth(); // 0-indexed

      // End at previous completed month
      const endDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      let current = new Date(startYear, startMonth, 1);

      while (current <= endDate) {
        const accrualMonth = `${current.getFullYear()}-${String(current.getMonth() + 1).padStart(2, '0')}`;
        try {
          const result = await accrueMonthForEmployee(emp, accrualMonth, adminId);
          if (result.skipped) results.skipped++;
          else results.processed++;
        } catch (err) {
          if (err.code === 11000) {
            results.skipped++;
          } else {
            results.errors.push({ employee: emp.empCode, month: accrualMonth, error: err.message });
          }
        }
        current = new Date(current.getFullYear(), current.getMonth() + 1, 1);
      }
    }

    res.json({ success: true, results });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// ─── POST /api/admin/leaves/adjustment ───────────────────────────────────────
export const adminLeaveAdjustment = async (req, res) => {
  try {
    const { employeeId, amount, reason, adminId } = req.body;
    if (!employeeId || amount === undefined || !reason) {
      return res.status(400).json({ success: false, message: 'employeeId, amount, and reason are required.' });
    }
    if (!mongoose.Types.ObjectId.isValid(employeeId)) {
      return res.status(400).json({ success: false, message: 'Invalid employee ID' });
    }

    const currentBalance = await getLeaveBalance(employeeId);
    const newBalance = currentBalance + Number(amount);

    if (newBalance < 0) {
      return res.status(400).json({
        success: false,
        message: `Cannot reduce balance below 0. Current balance: ${currentBalance}`
      });
    }

    const transaction = await LeaveTransaction.create({
      employeeId: new mongoose.Types.ObjectId(employeeId),
      transactionType: 'ADMIN_ADJUSTMENT',
      amount: Number(amount),
      reason,
      balanceAfterTransaction: newBalance,
      createdBy: adminId ? new mongoose.Types.ObjectId(adminId) : null
    });

    res.json({ success: true, transaction, newBalance });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// ─── GET /api/admin/leaves/accrual/overview ───────────────────────────────────
export const getAccrualOverview = async (req, res) => {
  try {
    const employees = await Employee.find({ status: 'Active' })
      .select('fullName empCode joinDate department');
    const now = new Date();
    const thisMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

    const overview = [];
    for (const emp of employees) {
      const empObjId = emp._id;

      const earnedAgg = await LeaveTransaction.aggregate([
        { $match: { employeeId: empObjId, transactionType: 'MONTHLY_ACCRUAL' } },
        { $group: { _id: null, total: { $sum: '$amount' } } }
      ]);
      const usedAgg = await LeaveTransaction.aggregate([
        { $match: { employeeId: empObjId, transactionType: 'LEAVE_USED' } },
        { $group: { _id: null, total: { $sum: '$amount' } } }
      ]);
      const available = await getLeaveBalance(empObjId.toString());

      const thisMonthAccrual = await LeaveTransaction.findOne({
        employeeId: empObjId,
        accrualMonth: thisMonth,
        transactionType: 'MONTHLY_ACCRUAL'
      });
      const lastAccrual = await LeaveTransaction.findOne(
        { employeeId: empObjId, transactionType: 'MONTHLY_ACCRUAL' },
        {},
        { sort: { createdAt: -1 } }
      );

      overview.push({
        _id: emp._id,
        fullName: emp.fullName,
        empCode: emp.empCode,
        joinDate: emp.joinDate,
        department: emp.department,
        available,
        totalEarned: earnedAgg.length > 0 ? earnedAgg[0].total : 0,
        totalUsed: usedAgg.length > 0 ? Math.abs(usedAgg[0].total) : 0,
        earnedThisMonth: thisMonthAccrual ? 1 : 0,
        lastAccrualDate: lastAccrual ? lastAccrual.createdAt : null
      });
    }

    res.json({ success: true, overview });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};
