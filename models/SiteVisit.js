import mongoose from 'mongoose';

const DailyRecordSchema = new mongoose.Schema({
  date: { type: String, required: true }, // YYYY-MM-DD
  checkIn: { type: Date },
  checkOut: { type: Date },
  totalHours: { type: String, default: '0h 0m' },
  regularHours: { type: String, default: '0h 0m' },
  overtimeHours: { type: String, default: '0h 0m' },
  workSummary: { type: String }
});

const SiteVisitSchema = new mongoose.Schema({
  employeeId: { type: mongoose.Schema.Types.ObjectId, ref: 'Employee', required: true },
  clientName: { type: String, required: true },
  siteName: { type: String, required: true },
  siteAddress: { type: String, required: true },
  latitude: { type: Number },
  longitude: { type: Number },
  purpose: { type: String, required: true },
  contactPerson: { type: String },
  contactNumber: { type: String },
  startDate: { type: String, required: true }, // YYYY-MM-DD
  startTime: { type: String }, // e.g. "09:30 AM" or "09:30"
  endDate: { type: String }, // YYYY-MM-DD
  expectedDailyHours: { type: Number, default: 8 },
  status: { type: String, enum: ['Pending', 'Approved', 'Rejected', 'Cancelled', 'Completed', 'Active'], default: 'Pending' },
  rejectionReason: { type: String },
  approvedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin' },
  approvedAt: { type: Date },
  completedAt: { type: Date },
  timeTaken: { type: String, default: '0h 0m' },
  totalTimeSeconds: { type: Number, default: 0 },
  dailyRecords: [DailyRecordSchema]
}, { timestamps: true });

export default mongoose.model('SiteVisit', SiteVisitSchema);
