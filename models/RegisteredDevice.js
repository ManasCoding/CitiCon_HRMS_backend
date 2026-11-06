import mongoose from 'mongoose';

const ScanHistorySchema = new mongoose.Schema({
  scannedAt: { type: Date, default: Date.now },
  action: { 
    type: String, 
    enum: ['CHECK_IN', 'CHECK_OUT', 'ALREADY_COMPLETED', 'BLOCKED_REJECTED', 'TOKEN_EXPIRED', 'FAILED'], 
    required: true 
  },
  status: { type: String, default: 'Success' },
  ipAddress: { type: String },
  notes: { type: String }
}, { _id: false });

const RegisteredDeviceSchema = new mongoose.Schema({
  employeeId: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'Employee', 
    required: true, 
    index: true 
  },
  deviceTokenHash: { 
    type: String, 
    required: true, 
    index: true 
  },
  deviceModel: { 
    type: String, 
    default: 'Mobile Device' 
  },
  operatingSystem: { 
    type: String, 
    default: 'Unknown OS' 
  },
  browserName: { 
    type: String, 
    default: 'Mobile Browser' 
  },
  registrationDate: { 
    type: Date, 
    default: Date.now 
  },
  lastUsedDate: { 
    type: Date, 
    default: Date.now 
  },
  lastIpAddress: { 
    type: String 
  },
  status: { 
    type: String, 
    enum: ['Active', 'Blocked', 'Unregistered'], 
    default: 'Active',
    index: true
  },
  scanHistory: [ScanHistorySchema]
}, { timestamps: true });

// Index to query active device per employee quickly
RegisteredDeviceSchema.index({ employeeId: 1, status: 1 });

export default mongoose.model('RegisteredDevice', RegisteredDeviceSchema);
