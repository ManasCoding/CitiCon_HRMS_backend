import mongoose from 'mongoose';

const AttendanceAuditLogSchema = new mongoose.Schema({
  employeeId: { type: mongoose.Schema.Types.ObjectId, ref: 'Employee', required: true },
  attendanceId: { type: mongoose.Schema.Types.ObjectId, ref: 'Attendance' }, // Optional because sometimes it's newly created during edit
  attendanceDate: { type: String, required: true }, // YYYY-MM-DD
  oldStatus: { type: String, required: true },
  newStatus: { type: String, required: true },
  updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin' },
  reason: { type: String, default: 'Manual Admin Update' }
}, { timestamps: true });

export default mongoose.model('AttendanceAuditLog', AttendanceAuditLogSchema);
