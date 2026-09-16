import mongoose from 'mongoose';

const LeaveRequestSchema = new mongoose.Schema({
  employeeId: { type: mongoose.Schema.Types.ObjectId, ref: 'Employee', required: true },
  leaveType: { type: String, required: true },
  fromDate: { type: String, required: true },
  toDate: { type: String, required: true },
  days: { type: Number, required: true },
  reason: { type: String, required: true },
  status: { type: String, enum: ['PENDING', 'APPROVED', 'REJECTED'], default: 'PENDING' },
  appliedOn: { type: Date, default: Date.now },
  approvedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin' },
  approvedOn: { type: Date }
}, { timestamps: true });

export default mongoose.model('LeaveRequest', LeaveRequestSchema);
