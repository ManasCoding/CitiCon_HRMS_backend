import mongoose from 'mongoose';

const EmployeeSchema = new mongoose.Schema({
  empCode: { type: String, required: true, unique: true },
  fullName: { type: String, required: true },
  email: { type: String, required: true, unique: true },
  phone: { type: String },
  department: { type: String },
  status: { type: String, default: 'Active' },
  joinDate: { type: Date, default: Date.now },
  profileImage: { type: String },
  role: { type: String, default: 'Team Member' },
  password: { type: String, default: '123456' },
  
  // Employment Journey
  employmentType: { type: String, default: 'Regular' },
  employmentHistory: [{
    empCode: String,
    employmentType: String,
    designation: String,
    department: String,
    startDate: Date,
    endDate: Date,
    status: { type: String, default: 'Completed' },
    salary: String,
    reason: String
  }],

  
  // Bank & Identity Details
  accountHolderName: { type: String },
  bankName: { type: String },
  accountNumber: { type: String },
  ifscCode: { type: String },
  branchName: { type: String },
  panNumber: { type: String },
  aadharNumber: { type: String },
  upiId: { type: String },
  pfAccount: { type: String }
}, { timestamps: true });

export default mongoose.model('Employee', EmployeeSchema);
