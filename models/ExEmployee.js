import mongoose from 'mongoose';

const ExEmployeeSchema = new mongoose.Schema({
  // Copied from Employee at time of exit
  empCode:      { type: String, required: true },
  fullName:     { type: String, required: true },
  email:        { type: String, required: true },
  phone:        { type: String },
  department:   { type: String },
  role:         { type: String, default: 'Team Member' },
  profileImage: { type: String },
  joinDate:     { type: Date },
  password:     { type: String },

  // Exit metadata
  originalEmployeeId: { type: mongoose.Schema.Types.ObjectId }, // original _id in Employee collection
  exitDate:     { type: Date, default: Date.now },
  exitReason:   { type: String, default: 'Resigned' }, // Resigned | Terminated | Contract Ended | Other
  status:       { type: String, default: 'Ex-Employee' }
}, { timestamps: true });

export default mongoose.model('ExEmployee', ExEmployeeSchema);
