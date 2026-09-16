import mongoose from 'mongoose';
import dotenv from 'dotenv';
import Attendance from '../models/Attendance.js';
import LeaveRequest from '../models/LeaveRequest.js';
import Holiday from '../models/Holiday.js';
import { calculateAttendanceStatus } from '../utils/attendanceCalculator.js';

dotenv.config();

export const sanitizeAllAttendanceRecords = async () => {
  console.log('--- Starting Attendance Database Sanitization ---');
  try {
    const records = await Attendance.find({});
    console.log(`Found ${records.length} total attendance records in database.`);

    const holidays = await Holiday.find({});
    const holidayDates = new Set(holidays.map(h => h.holidayDate));

    const leaves = await LeaveRequest.find({ status: 'APPROVED' });

    let updatedCount = 0;

    for (const record of records) {
      const dateStr = record.date;
      const isHoliday = holidayDates.has(dateStr);
      
      const empIdStr = record.employeeId ? record.employeeId.toString() : '';
      const isLeave = leaves.some(l => {
        const lEmpId = l.employeeId ? l.employeeId.toString() : '';
        return lEmpId === empIdStr && l.fromDate <= dateStr && l.toDate >= dateStr;
      });

      const calc = calculateAttendanceStatus(record, { isHoliday, isLeave });
      
      let changed = false;
      if (record.status !== calc.status) {
        record.status = calc.status;
        changed = true;
      }
      if (record.workHours !== calc.workHours) {
        record.workHours = calc.workHours;
        changed = true;
      }
      if (record.isLate !== calc.isLate) {
        record.isLate = calc.isLate;
        changed = true;
      }
      if (record.lateMinutes !== calc.lateMinutes) {
        record.lateMinutes = calc.lateMinutes;
        changed = true;
      }

      if (changed) {
        await record.save();
        updatedCount++;
      }
    }

    console.log(`--- Sanitization Complete: Updated ${updatedCount} records to match time source of truth. ---`);
    return { success: true, total: records.length, updated: updatedCount };
  } catch (err) {
    console.error('Error during attendance sanitization:', err.message);
    return { success: false, error: err.message };
  }
};

// If run directly via node CLI
if (process.argv[1] && process.argv[1].endsWith('sanitizeAttendance.js')) {
  const MONGO_URI = process.env.MONGO_URI || process.env.MONGODB_URI;
  if (MONGO_URI) {
    mongoose.connect(MONGO_URI).then(async () => {
      await sanitizeAllAttendanceRecords();
      process.exit(0);
    }).catch(err => {
      console.error(err);
      process.exit(1);
    });
  } else {
    console.error('MONGO_URI environment variable not defined.');
  }
}
