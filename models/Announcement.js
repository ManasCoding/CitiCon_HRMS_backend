import mongoose from 'mongoose';

const announcementSchema = new mongoose.Schema({
  title: {
    type: String,
    required: true,
    trim: true
  },
  description: {
    type: String,
    required: true
  },
  priority: {
    type: String,
    enum: ['Normal', 'Urgent', 'Holiday'],
    default: 'Normal'
  },
  publishDate: {
    type: Date,
    default: Date.now
  },
  validUntil: {
    type: Date,
    required: true
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Admin', // Or whoever creates it
    required: false
  },
  status: {
    type: String,
    enum: ['Active', 'Expired'],
    default: 'Active'
  }
}, { timestamps: true });

export default mongoose.model('Announcement', announcementSchema);
