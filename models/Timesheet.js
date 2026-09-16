import mongoose from 'mongoose';

const hourlyTaskSchema = new mongoose.Schema({
  date: { type: String, required: true }, // YYYY-MM-DD
  slotKey: { type: String, required: true }, // e.g., '09:30 - 10:30'
  title: { type: String, required: true },
  status: { type: String, default: 'Completed' }
}, { _id: false });

const timesheetSchema = new mongoose.Schema({
  employeeId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Employee',
    required: true
  },
  employeeName: { type: String, required: true },
  department: { type: String },
  date: { type: String, required: true }, // YYYY-MM-DD of the day being submitted
  weekStart: { type: String, required: true }, // YYYY-MM-DD
  weekEnd: { type: String, required: true }, // YYYY-MM-DD
  loginTime: { type: String }, // '09:30 AM'
  logoutTime: { type: String }, // '06:30 PM'
  hourlyTasks: [hourlyTaskSchema],
  dailyRemarks: { type: String },
  weeklyRemarks: { type: String },
  totalHours: { type: String, default: '0h 0m' },
  overtime: { type: String, default: '0h 0m' },
  submissionTime: { type: Date },
  status: {
    type: String,
    enum: ['Pending', 'Submitted', 'Completed'],
    default: 'Pending'
  }
}, { timestamps: true });

// Prevent duplicate timesheets per employee per date
timesheetSchema.index({ employeeId: 1, date: 1 }, { unique: true });

export default mongoose.model('Timesheet', timesheetSchema);
