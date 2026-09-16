import mongoose from 'mongoose';

const reviewSchema = new mongoose.Schema({
  date: { type: Date, default: Date.now },
  reviewer: { type: String, required: true },
  rating: { type: Number, required: true },
  comments: { type: String }
});

const goalSchema = new mongoose.Schema({
  title: { type: String, required: true },
  target: { type: String },
  progress: { type: Number, default: 0 }, // 0 to 100
  status: { type: String, enum: ['Pending', 'In Progress', 'Completed'], default: 'Pending' },
  dueDate: { type: Date }
});

const achievementSchema = new mongoose.Schema({
  title: { type: String, required: true },
  description: { type: String },
  date: { type: Date, default: Date.now }
});

const employeePerformanceSchema = new mongoose.Schema({
  employeeId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Employee',
    required: true,
    unique: true
  },
  parameters: {
    qualityOfWork: { type: Number, default: 0, min: 0, max: 5 },
    productivity: { type: Number, default: 0, min: 0, max: 5 },
    communication: { type: Number, default: 0, min: 0, max: 5 },
    teamwork: { type: Number, default: 0, min: 0, max: 5 },
    punctuality: { type: Number, default: 0, min: 0, max: 5 },
    problemSolving: { type: Number, default: 0, min: 0, max: 5 }
  },
  overallRating: { type: Number, default: 0 },
  goalsCompleted: { type: Number, default: 0 }, // Represents a percentage 0-100
  status: { 
    type: String, 
    enum: ['Excellent', 'Good', 'Average', 'Needs Improvement'],
    default: 'Average'
  },
  lastReviewDate: { type: Date },
  reviews: [reviewSchema],
  goals: [goalSchema],
  achievements: [achievementSchema],
  areasForImprovement: [{
    point: String,
    comments: String
  }]
}, { timestamps: true });

// Middleware to calculate overallRating automatically before saving
employeePerformanceSchema.pre('save', function(next) {
  const p = this.parameters;
  const avg = (p.qualityOfWork + p.productivity + p.communication + p.teamwork + p.punctuality + p.problemSolving) / 6;
  this.overallRating = parseFloat(avg.toFixed(1));
  
  if (this.overallRating >= 4.5) {
    this.status = 'Excellent';
  } else if (this.overallRating >= 3.5) {
    this.status = 'Good';
  } else if (this.overallRating >= 2.5) {
    this.status = 'Average';
  } else {
    this.status = 'Needs Improvement';
  }
  
  next();
});

export default mongoose.model('EmployeePerformance', employeePerformanceSchema);
