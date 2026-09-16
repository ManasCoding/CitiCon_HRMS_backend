import mongoose from 'mongoose';

const notificationLogSchema = new mongoose.Schema({
  employeeId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Employee',
    required: true
  },
  announcementId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Announcement',
    required: true
  },
  emailStatus: {
    type: String,
    enum: ['Pending', 'Sent', 'Failed', 'Skipped'],
    default: 'Pending'
  },
  smsStatus: {
    type: String,
    enum: ['Pending', 'Sent', 'Failed', 'Skipped'],
    default: 'Pending'
  },
  errorMessage: {
    type: String,
    default: null
  },
  sentAt: {
    type: Date,
    default: null
  }
}, { timestamps: true });

export default mongoose.model('NotificationLog', notificationLogSchema);
