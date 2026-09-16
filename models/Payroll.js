import mongoose from 'mongoose';

const PayrollSchema = new mongoose.Schema({
  employeeId: { type: mongoose.Schema.Types.ObjectId, ref: 'Employee', required: true },
  month: { type: Number, required: true },
  year: { type: Number, required: true },

  // Payroll Cycle Period (21st prev month → 20th current month)
  periodStart: { type: String }, // "YYYY-MM-DD"
  periodEnd: { type: String },   // "YYYY-MM-DD"
  
  // Employee snapshot (cached for PDF generation)
  employeeName: { type: String },
  employeePhoto: { type: String },
  employeeCode: { type: String },
  department: { type: String },
  designation: { type: String },
  employeeEmail: { type: String },
  employeePhone: { type: String },
  joiningDate: { type: Date },
  panNumber: { type: String },
  aadharNumber: { type: String },
  bankName: { type: String },
  accountNumber: { type: String },
  ifscCode: { type: String },
  branchName: { type: String },
  upiId: { type: String },

  // Attendance Summary
  workingDays: { type: Number, required: true, default: 0 },
  presentDays: { type: Number, required: true, default: 0 },
  absentDays: { type: Number, required: true, default: 0 },
  halfDays: { type: Number, required: true, default: 0 },
  paidLeaves: { type: Number, required: true, default: 0 },
  unpaidLeaves: { type: Number, required: true, default: 0 },
  weeklyOffs: { type: Number, required: true, default: 0 },
  holidays: { type: Number, required: true, default: 0 },
  lateMarks: { type: Number, default: 0 },
  payableDays: { type: Number, default: 0 },

  // Core Salary
  basicSalary: { type: Number, required: true },
  perDaySalary: { type: Number, default: 0 },

  // Allowances (Earnings)
  hra: { type: Number, default: 0 },
  medicalAllowance: { type: Number, default: 0 },
  travelAllowance: { type: Number, default: 0 },
  foodAllowance: { type: Number, default: 0 },
  specialAllowance: { type: Number, default: 0 },
  bonus: { type: Number, default: 0 },
  overtime: { type: Number, default: 0 },
  otherEarnings: { type: Number, default: 0 },

  // Calculated Earnings
  presentSalary: { type: Number, default: 0 },
  halfDaySalary: { type: Number, default: 0 },
  paidLeaveSalary: { type: Number, default: 0 },
  totalEarnings: { type: Number, default: 0 },

  // Deductions
  professionalTax: { type: Number, default: 0 },
  pf: { type: Number, default: 0 },
  esi: { type: Number, default: 0 },
  tds: { type: Number, default: 0 },
  advance: { type: Number, default: 0 },
  loan: { type: Number, default: 0 },
  penalty: { type: Number, default: 0 },
  absentDeduction: { type: Number, default: 0 },
  unpaidLeaveDeduction: { type: Number, default: 0 },
  lateFine: { type: Number, default: 0 },
  otherDeductions: { type: Number, default: 0 },
  totalDeductions: { type: Number, default: 0 },

  // Totals
  grossSalary: { type: Number, required: true },
  netSalary: { type: Number, required: true },
  amountInWords: { type: String },

  // PDF
  pdfUrl: { type: String },

  // Metadata
  status: { type: String, enum: ['Generated', 'Locked', 'Draft'], default: 'Generated' },
  generatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin' },
  generatedDate: { type: Date, default: Date.now }
}, { timestamps: true });

// Prevent duplicate payroll for the same employee, month and year
PayrollSchema.index({ employeeId: 1, month: 1, year: 1 }, { unique: true });

export default mongoose.model('Payroll', PayrollSchema);
