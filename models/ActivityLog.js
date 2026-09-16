import mongoose from 'mongoose';

const ActivityLogSchema = new mongoose.Schema({
  adminId: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin' },
  employeeId: { type: mongoose.Schema.Types.ObjectId, ref: 'Employee' },
  action: { type: String, required: true }, // e.g. 'Login', 'Logout', 'Update Profile'
  status: { type: String, enum: ['Success', 'Failed'], default: 'Success' },
  ipAddress: { type: String },
  device: { type: String },
  browser: { type: String },
  location: { type: String },
  timestamp: { type: Date, default: Date.now }
});

export default mongoose.model('ActivityLog', ActivityLogSchema);
