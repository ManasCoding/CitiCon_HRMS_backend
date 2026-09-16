import mongoose from 'mongoose';

const DocumentSchema = new mongoose.Schema({
  employeeId: { type: mongoose.Schema.Types.ObjectId, ref: 'Employee', required: true },
  title: { type: String, required: true },
  category: { type: String, required: true }, // Identity, Education, Banking, Employment, Other
  fileUrl: { type: String, required: true },
  fileType: { type: String, default: 'pdf' }, // pdf, jpg, png
  fileSize: { type: String }, // e.g., "1.2 MB"
  uploadedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin' },
  uploadedAt: { type: Date, default: Date.now }
}, { timestamps: true });

export default mongoose.model('Document', DocumentSchema);
