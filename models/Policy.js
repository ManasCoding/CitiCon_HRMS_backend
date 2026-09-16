import mongoose from 'mongoose';

const policySchema = new mongoose.Schema({
  title: {
    type: String,
    required: true,
    unique: true,
    trim: true,
  },
  content: {
    type: String,
    required: true,
  },
  category: {
    type: String,
    required: true,
    default: 'General',
  },
}, { timestamps: true });

export default mongoose.model('Policy', policySchema);
