import cron from 'node-cron';
import Attendance from '../models/Attendance.js';
import Employee from '../models/Employee.js';
import LeaveTransaction from '../models/LeaveTransaction.js';
import { calculateAttendanceStatus } from './attendanceCalculator.js';
import { processEndOfDayReport } from '../workers/endOfDayReportWorker.js';

export const initCronJobs = () => {
  // Runs on the 1st of every month at 01:00 AM
  // Processes the PREVIOUS completed month for all active employees
  cron.schedule('0 1 1 * *', async () => {
    console.log('Running monthly earned leave accrual job...');
    try {
      const now = new Date();
      const targetDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const accrualMonth = `${targetDate.getFullYear()}-${String(targetDate.getMonth() + 1).padStart(2, '0')}`;

      const employees = await Employee.find({ status: 'Active' });
      let processed = 0, skipped = 0;

      for (const emp of employees) {
        const joinDate = new Date(emp.joinDate || emp.createdAt);
        const joinMonth = `${joinDate.getFullYear()}-${String(joinDate.getMonth() + 1).padStart(2, '0')}`;
        if (accrualMonth < joinMonth) { skipped++; continue; }

        try {
          const existing = await LeaveTransaction.findOne({
            employeeId: emp._id,
            accrualMonth,
            transactionType: 'MONTHLY_ACCRUAL'
          });
          if (existing) { skipped++; continue; }

          // Compute current balance
          const balanceResult = await LeaveTransaction.aggregate([
            { $match: { employeeId: emp._id } },
            { $group: { _id: null, total: { $sum: '$amount' } } }
          ]);
          const currentBalance = balanceResult.length > 0 ? balanceResult[0].total : 0;

          await LeaveTransaction.create({
            employeeId: emp._id,
            transactionType: 'MONTHLY_ACCRUAL',
            amount: 1,
            accrualMonth,
            leaveType: 'Earned Leave',
            reason: `Monthly earned leave accrual for ${accrualMonth}`,
            balanceAfterTransaction: currentBalance + 1,
            createdBy: null
          });
          processed++;
        } catch (err) {
          if (err.code === 11000) { skipped++; }
          else { console.error(`Accrual error for ${emp.empCode}:`, err.message); }
        }
      }
      console.log(`Monthly accrual for ${accrualMonth}: processed=${processed}, skipped=${skipped}`);
    } catch (error) {
      console.error('Monthly accrual cron error:', error);
    }
  });

  // ───────────────────────────────────────────────────────────────────────
  // Daily End of Day Work Report
  const reportTime = process.env.REPORT_END_TIME || '18:00';
  const [reportHour, reportMinute] = reportTime.split(':');
  const reportTimezone = process.env.REPORT_TIMEZONE || 'Asia/Kolkata';

  cron.schedule(`${reportMinute} ${reportHour} * * *`, async () => {
    console.log(`Running End of Day Report Job at ${reportTime} (${reportTimezone})...`);
    await processEndOfDayReport();
  }, {
    timezone: reportTimezone
  });
};
