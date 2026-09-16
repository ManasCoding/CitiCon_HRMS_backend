import mongoose from 'mongoose';

const EXIT_TASKS = [
  'Handover Documents',
  'Return Company Assets',
  'Clear Dues',
  'Exit Interview',
  'Final Settlement',
];

const checklistItemSchema = new mongoose.Schema({
  task:        { type: String, required: true },
  status:      { type: String, enum: ['Pending', 'Completed'], default: 'Pending' },
  completedAt: { type: Date },
}, { _id: false });

const ResignationSchema = new mongoose.Schema({
  employeeId:     { type: mongoose.Schema.Types.ObjectId, ref: 'Employee', required: true },
  resignationDate:{ type: String, required: true },
  lastWorkingDay: { type: String },           // auto-set to resignationDate + 60 days on approval
  reason:         { type: String, required: true },
  comments:       { type: String },
  attachment:     { type: String },
  status:         { type: String, enum: ['PENDING', 'APPROVED', 'REJECTED', 'COMPLETED'], default: 'PENDING' },
  submittedOn:    { type: Date, default: Date.now },
  reviewedBy:     { type: mongoose.Schema.Types.ObjectId, ref: 'Admin' },
  reviewedOn:     { type: Date },
  exitChecklist:  {
    type: [checklistItemSchema],
    default: () => EXIT_TASKS.map(t => ({ task: t, status: 'Pending' })),
  },
}, { timestamps: true });

export { EXIT_TASKS };
export default mongoose.model('Resignation', ResignationSchema);
