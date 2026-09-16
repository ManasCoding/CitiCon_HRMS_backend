import mongoose from 'mongoose';

const AttendanceSchema = new mongoose.Schema({
  employeeId: { type: mongoose.Schema.Types.ObjectId, ref: 'Employee', required: true },
  date: { type: String, required: true }, // YYYY-MM-DD
  checkIn: { type: Date },
  checkOut: { type: Date },
  workHours: { type: String, default: '0h 0m' }, // e.g. "8h 30m"
  overtime: { type: String, default: '0h 0m' },
  workStatus: { type: String, enum: ['Completed', 'Pending', 'Not Submitted'], default: 'Pending' },
  status: { type: String, enum: ['Present', 'Absent', 'Half Day', 'Late', 'Paid Leave', 'Unpaid Leave', 'Holiday', 'Weekend', 'Site Visit'], default: 'Present' },
  isLate: { type: Boolean, default: false }, // true if employee checked in after 9:30 AM threshold
  lateMinutes: { type: Number, default: 0 }, // minutes late from 9:30 AM
  autoCheckedOut: { type: Boolean, default: false },
  autoCheckoutReason: { type: String, default: '' },
  totalWorkingSeconds: { type: Number, default: 0 },
  totalOvertimeSeconds: { type: Number, default: 0 },
  // ── Late / Half-Day Approval ─────────────────────────────────────────────────
  checkInApprovalStatus: {
    type: String,
    enum: ['Not Required', 'Pending', 'Approved', 'Rejected'],
    default: 'Not Required'
  },
  // Tracks what kind of exception is pending (Late or Half Day)
  exceptionType: {
    type: String,
    enum: ['None', 'Late', 'Half Day'],
    default: 'None'
  },
  // The status that should be restored after approval (Late or Half Day)
  originalStatus: {
    type: String,
    enum: ['Present', 'Late', 'Half Day', 'Absent', null],
    default: null
  },
  approvalRequestedAt: { type: Date },
  approvedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin' },
  approvedAt: { type: Date },
  rejectedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin' },
  rejectedAt: { type: Date },
  rejectionReason: { type: String },
  // ─────────────────────────────────────────────────────────────────────────────
  location: {
    lat: Number,
    lng: Number
  },
  lastExitTime: { type: Date },
  remarks: { type: String }
}, { timestamps: true });

// Prevent duplicate attendance records per employee per date
AttendanceSchema.index({ employeeId: 1, date: 1 }, { unique: true });

export default mongoose.model('Attendance', AttendanceSchema);
