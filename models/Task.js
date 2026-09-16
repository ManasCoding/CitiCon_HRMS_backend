import mongoose from 'mongoose';

const TaskSchema = new mongoose.Schema({
  employeeId: { type: mongoose.Schema.Types.ObjectId, ref: 'Employee', required: true },
  title: { type: String, required: true },
  description: { type: String },
  slotKey: { type: String }, // e.g., "09:00-10:00"
  status: { type: String, default: 'Pending' },
  date: { type: String, required: true }, // YYYY-MM-DD
}, { timestamps: true });

export default mongoose.model('Task', TaskSchema);
