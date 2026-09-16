import express from 'express';
import http from 'http';
import cors from 'cors';
import helmet from 'helmet';
import bcrypt from 'bcrypt';
import dotenv from 'dotenv';
import connectDB from './db.js';
import Admin from './models/Admin.js';
import SystemSetting from './models/SystemSetting.js';
import Attendance from './models/Attendance.js';
import { initSocket } from './socket.js';
import { initCronJobs } from './utils/cronJobs.js';
import { calculateAttendanceStatus } from './utils/attendanceCalculator.js';

// Route Imports
import authRoutes from './routes/authRoutes.js';
import employeeRoutes from './routes/employeeRoutes.js';
import adminRoutes from './routes/adminRoutes.js';
import publicRoutes from './routes/publicRoutes.js';
import announcementRoutes from './routes/announcementRoutes.js';
import holidayRoutes from './routes/holidayRoutes.js';
import timesheetRoutes from './routes/timesheetRoutes.js';
import payrollRoutes from './routes/payrollRoutes.js';
import policyRoutes from './routes/policyRoutes.js';
import performanceRoutes from './routes/performanceRoutes.js';
import siteVisitRoutes from './routes/siteVisitRoutes.js';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;

// Security Middleware
app.use(helmet({
  referrerPolicy: { policy: "strict-origin-when-cross-origin" }
}));

// Middleware

// ── CORS ────────────────────────────────────────────────────────────────────
// Allow all origins so the React Native / Expo mobile app can connect from
// any local-network IP, emulator, or physical device.
// In production you can lock this down to specific domains.
app.use(cors({
  origin: (origin, callback) => {
    const allowedOrigins = [
      'https://citiconhrmsfrontend.vercel.app',
      'http://localhost:5173',
      'http://localhost:3000'
    ];
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
}));

app.use(express.json());

// Request Logger
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.url}`);
  next();
});

// Seed Default Admin & Settings
const seedData = async () => {
  try {
    // Admin
    const admins = [
      { fullName: 'Guman Singh', email: 'gumansingh.oditechglobal@gmail.com', password: '123456' },
      { fullName: 'Oditech Official', email: 'oditechofficial@gmail.com', password: '123456' }
    ];

    for (const adminData of admins) {
      if (!(await Admin.findOne({ email: adminData.email }))) {
        const hashedPassword = await bcrypt.hash(adminData.password, 10);
        await Admin.create({ 
          fullName: adminData.fullName, 
          email: adminData.email, 
          password: hashedPassword 
        });
        console.log(`Admin seeded: ${adminData.email}`);
      }
    }

    // Default Settings
    const defaultSettings = [
      { key: 'workday_start', value: '09:30' },
      { key: 'logout_time', value: '18:30' },
      { key: 'late_threshold', value: '09:31' },
      { key: 'max_work_hours', value: 9.0 },
      { key: 'casual_leave', value: 12 },
      { key: 'sick_leave', value: 10 },
      { key: 'office_lat', value: 20.2961 },
      { key: 'office_lng', value: 85.8331 },
      { key: 'geofence_radius', value: 50 },
      { key: 'maintenance_mode', value: 'false' },
      { key: 'maintenance_message', value: 'System will be offline for 2 hours.' },
      { key: 'site_visit_max_hours', value: 8 },
      { key: 'site_visit_min_hours', value: 4 },
      { key: 'site_visit_max_overtime', value: 2 },
      { key: 'site_visit_overtime_enabled', value: true },
      { key: 'site_visit_overtime_approval_required', value: false },
      { key: 'site_visit_geofence_radius', value: 200 }
    ];

    for (const setting of defaultSettings) {
      await SystemSetting.findOneAndUpdate(
        { key: setting.key },
        { value: setting.value },
        { upsert: true }
      );
    }
  } catch (err) {
    console.error('Error seeding data:', err.message);
  }
};

import { sanitizeAllAttendanceRecords } from './scripts/sanitizeAttendance.js';

connectDB().then(() => {
  seedData();
  initCronJobs();
  sanitizeAllAttendanceRecords();
});

app.get("/", (req, res) => {
  res.send("Working on Render 🚀");
});

// Routes
app.use('/api', authRoutes); // Includes /login, /auth/forgot-password etc.
app.use('/api/employee', employeeRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api', publicRoutes); // Includes /notifications, /settings
app.use('/api/announcements', announcementRoutes);
app.use('/api/holidays', holidayRoutes);
app.use('/api/timesheets', timesheetRoutes);
app.use('/api/payroll', payrollRoutes);
app.use('/api/policies', policyRoutes);
app.use('/api/performance', performanceRoutes);
app.use('/api/site-visits', siteVisitRoutes);

// if (process.env.NODE_ENV !== 'production') {
//   app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
// }

const httpServer = http.createServer(app);
initSocket(httpServer);

const server = httpServer.listen(PORT, "0.0.0.0", () => {
  console.log(`Server running on port ${PORT}`);
});




server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`Port ${PORT} is already in use.`);
  } else {
    console.error('Server error:', err);
  }
});

export default app;
