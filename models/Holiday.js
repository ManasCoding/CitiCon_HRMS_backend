import mongoose from 'mongoose';

const holidaySchema = new mongoose.Schema({
  announcementId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Announcement',
    required: true
  },
  holidayName: {
    type: String,
    required: true,
    trim: true
  },
  holidayDate: {
    type: String, // Storing as string 'YYYY-MM-DD' for easy matching
    required: true,
    unique: true // Prevent duplicate holidays on the same date
  },
  isHoliday: {
    type: Boolean,
    default: true
  }
}, { timestamps: true });

export default mongoose.model('Holiday', holidaySchema);
