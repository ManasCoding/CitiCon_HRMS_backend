import mongoose from 'mongoose';

const LeaveTransactionSchema = new mongoose.Schema({
  employeeId: { type: mongoose.Schema.Types.ObjectId, ref: 'Employee', required: true },
  transactionType: {
    type: String,
    enum: ['MONTHLY_ACCRUAL', 'LEAVE_USED', 'ADMIN_ADJUSTMENT', 'LEAVE_REVERSAL'],
    required: true
  },
  amount: { type: Number, required: true }, // positive = credit, negative = debit
  accrualMonth: { type: String }, // 'YYYY-MM', only for MONTHLY_ACCRUAL
  leaveType: { type: String },
  leaveRequestId: { type: mongoose.Schema.Types.ObjectId, ref: 'LeaveRequest' },
  reason: { type: String, default: '' },
  balanceAfterTransaction: { type: Number, required: true },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin' }
}, { timestamps: true });

// Unique compound index to prevent duplicate monthly accruals per employee per month
LeaveTransactionSchema.index(
  { employeeId: 1, accrualMonth: 1, transactionType: 1 },
  { unique: true, partialFilterExpression: { transactionType: 'MONTHLY_ACCRUAL' } }
);

export default mongoose.model('LeaveTransaction', LeaveTransactionSchema);
