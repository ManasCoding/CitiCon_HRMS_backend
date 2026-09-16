import mongoose from 'mongoose';

const NoteSchema = new mongoose.Schema({
  employeeId: { type: mongoose.Schema.Types.ObjectId, ref: 'Employee', required: true },
  message: { type: String, required: true, trim: true, maxlength: 1000 },
  isRead: { type: Boolean, default: false },
}, { timestamps: true });

export default mongoose.model('Note', NoteSchema);
