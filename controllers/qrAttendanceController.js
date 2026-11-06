import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import QRCode from 'qrcode';
import bcrypt from 'bcrypt';
import Employee from '../models/Employee.js';
import Attendance from '../models/Attendance.js';
import RegisteredDevice from '../models/RegisteredDevice.js';
import ActivityLog from '../models/ActivityLog.js';
import SystemSetting from '../models/SystemSetting.js';
import { calculateAttendanceStatus, ATTENDANCE_CONFIG, getTodayDateIST } from '../utils/attendanceCalculator.js';

const JWT_SECRET = process.env.JWT_SECRET || 'oditechglobal_secret_99';

// Timezone aware greeting
export const getGreetingIST = () => {
  const now = new Date();
  const tzStr = now.toLocaleString('en-US', { timeZone: 'Asia/Kolkata', hour12: false });
  const timePart = tzStr.split(', ')[1] || tzStr;
  const [hStr, mStr] = timePart.split(':');
  const h = parseInt(hStr, 10);
  const m = parseInt(mStr, 10);
  const totalMins = h * 60 + m;

  // 05:00 AM (300) to 11:59 AM (719): GOOD MORNING
  if (totalMins >= 300 && totalMins < 720) return 'GOOD MORNING';
  // 12:00 PM (720) to 04:59 PM (1019): GOOD AFTERNOON
  if (totalMins >= 720 && totalMins < 1020) return 'GOOD AFTERNOON';
  // 05:00 PM (1020) to 08:59 PM (1259): GOOD EVENING
  if (totalMins >= 1020 && totalMins < 1260) return 'GOOD EVENING';
  // 09:00 PM to 04:59 AM: WELCOME
  return 'WELCOME';
};

// Helper: parse user agent into readable OS, Browser, Device
const parseUserAgent = (uaString = '', clientInfo = {}) => {
  let os = clientInfo.operatingSystem || 'Unknown OS';
  let browser = clientInfo.browserName || 'Mobile Browser';
  let model = clientInfo.deviceModel || 'Mobile Device';

  if (!clientInfo.operatingSystem) {
    if (/android/i.test(uaString)) os = 'Android';
    else if (/iphone|ipad|ipod/i.test(uaString)) os = 'iOS';
    else if (/windows/i.test(uaString)) os = 'Windows';
    else if (/macintosh|mac os x/i.test(uaString)) os = 'macOS';
    else if (/linux/i.test(uaString)) os = 'Linux';
  }

  if (!clientInfo.browserName) {
    if (/chrome|crios/i.test(uaString) && !/edge|edg/i.test(uaString)) browser = 'Chrome';
    else if (/safari/i.test(uaString) && !/chrome|crios/i.test(uaString)) browser = 'Safari';
    else if (/firefox|fxios/i.test(uaString)) browser = 'Firefox';
    else if (/edg/i.test(uaString)) browser = 'Edge';
    else if (/opera|opr/i.test(uaString)) browser = 'Opera';
  }

  if (!clientInfo.deviceModel) {
    if (/iphone/i.test(uaString)) model = 'iPhone';
    else if (/ipad/i.test(uaString)) model = 'iPad';
    else if (/pixel/i.test(uaString)) model = 'Google Pixel';
    else if (/samsung|sm-[a-z0-9]+/i.test(uaString)) model = 'Samsung Galaxy';
    else if (/oneplus/i.test(uaString)) model = 'OnePlus';
    else if (/xiaomi|redmi/i.test(uaString)) model = 'Xiaomi/Redmi';
    else if (/android/i.test(uaString)) model = 'Android Smartphone';
  }

  return { os, browser, model };
};

// Helper to hash persistent device credential token
const hashDeviceToken = (token) => {
  return crypto.createHash('sha256').update(String(token).trim()).digest('hex');
};

/**
 * 1. GET LIVE DYNAMIC QR CODE & TOKEN
 * Generates signed token valid for configurable seconds (default 60s).
 */
export const getLiveQrCode = async (req, res) => {
  try {
    const expirySetting = await SystemSetting.findOne({ key: 'qr_token_expiry_seconds' });
    const expirySeconds = parseInt(expirySetting?.value, 10) || 60;

    const frontendBaseUrl = (process.env.FRONTEND_URL || 'https://neo-ren-hrms-frontend.vercel.app').replace(/\/$/, '');

    const nonce = crypto.randomBytes(16).toString('hex');
    const token = jwt.sign(
      {
        type: 'OFFICE_QR_ATTENDANCE',
        nonce,
        serverTime: Date.now()
      },
      JWT_SECRET,
      { expiresIn: `${expirySeconds}s` }
    );

    const qrUrl = `${frontendBaseUrl}/qr-attendance?token=${encodeURIComponent(token)}`;

    // Generate high-resolution base64 PNG for display / print
    const qrDataUrl = await QRCode.toDataURL(qrUrl, {
      errorCorrectionLevel: 'H',
      margin: 2,
      width: 400,
      color: {
        dark: '#0f172a',
        light: '#ffffff'
      }
    });

    res.json({
      success: true,
      token,
      expirySeconds,
      expiresIn: expirySeconds,
      qrUrl,
      qrDataUrl,
      serverTime: new Date().toISOString()
    });
  } catch (error) {
    console.error('[getLiveQrCode Error]:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * 2. VERIFY QR TOKEN
 */
export const verifyQrToken = async (req, res) => {
  const { qrToken } = req.body;
  if (!qrToken) {
    return res.status(400).json({ success: false, message: 'QR Token is missing' });
  }

  try {
    const decoded = jwt.verify(qrToken, JWT_SECRET);
    if (decoded.type !== 'OFFICE_QR_ATTENDANCE') {
      return res.status(400).json({ success: false, message: 'Invalid QR Token type' });
    }
    return res.json({ success: true, valid: true });
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return res.status(401).json({ 
        success: false, 
        expired: true, 
        message: 'This QR code has expired. Please scan the current code on the office display.' 
      });
    }
    return res.status(401).json({ success: false, message: 'Invalid or forged QR token.' });
  }
};

/**
 * 3. SCAN ATTENDANCE VIA REGISTERED DEVICE
 * Automated identification and check-in / check-out from next day onward.
 */
export const scanQrAttendance = async (req, res) => {
  const { qrToken, deviceCredential, clientInfo } = req.body;
  const ipAddress = req.headers['x-forwarded-for'] || req.socket.remoteAddress || '';
  const userAgentStr = req.headers['user-agent'] || '';

  // Step 1: Validate QR Token
  if (!qrToken) {
    return res.status(400).json({ success: false, message: 'QR code token is missing. Please scan again.' });
  }

  try {
    const decoded = jwt.verify(qrToken, JWT_SECRET);
    if (decoded.type !== 'OFFICE_QR_ATTENDANCE') {
      return res.status(400).json({ success: false, message: 'Invalid QR token.' });
    }
  } catch (err) {
    return res.status(401).json({ 
      success: false, 
      expired: true, 
      message: 'QR code has expired. Please scan the latest code on the office screen.' 
    });
  }

  // Step 2: Check Device Credential
  if (!deviceCredential) {
    return res.json({ 
      success: false, 
      requireAuth: true, 
      message: 'No registered device detected on this mobile browser. Please log in to bind this device.' 
    });
  }

  try {
    const deviceHash = hashDeviceToken(deviceCredential);
    const registeredDevice = await RegisteredDevice.findOne({ deviceTokenHash: deviceHash }).populate('employeeId');

    if (!registeredDevice) {
      return res.json({ 
        success: false, 
        requireAuth: true, 
        message: 'Device credential not recognized or has been reset. Please log in to register this device.' 
      });
    }

    // Step 3: Check Device Status
    if (registeredDevice.status === 'Blocked') {
      // Record blocked attempt
      registeredDevice.scanHistory.unshift({
        scannedAt: new Date(),
        action: 'BLOCKED_REJECTED',
        status: 'Blocked',
        ipAddress,
        notes: 'Scan rejected: device is blocked by admin'
      });
      if (registeredDevice.scanHistory.length > 50) registeredDevice.scanHistory.pop();
      await registeredDevice.save();

      return res.status(403).json({ 
        success: false, 
        blocked: true, 
        message: 'This mobile device has been blocked by your administrator. Attendance cannot be recorded.' 
      });
    }

    if (registeredDevice.status === 'Unregistered') {
      return res.json({ 
        success: false, 
        requireAuth: true, 
        message: 'This device registration was cleared by Admin. Please log in to re-register.' 
      });
    }

    const employee = registeredDevice.employeeId;
    if (!employee || employee.status !== 'Active') {
      return res.status(403).json({ success: false, message: 'Employee profile is not active. Contact HR.' });
    }

    // Step 4: Execute Attendance Engine Logic
    const now = new Date();
    const today = getTodayDateIST();
    const tzStr = now.toLocaleString('en-US', { timeZone: 'Asia/Kolkata' });
    const localDate = new Date(tzStr);

    if (localDate.getDay() === 0) {
      return res.json({ 
        success: false, 
        message: 'Today is Sunday — office is closed and attendance is not required.' 
      });
    }

    let attendance = await Attendance.findOne({ employeeId: employee._id, date: today });
    const greeting = getGreetingIST();

    // ─────────────────────────────────────────────────────────────
    // SCENARIO 1: FIRST SCAN OF THE DAY -> RECORD CHECK-IN
    // ─────────────────────────────────────────────────────────────
    if (!attendance || !attendance.checkIn) {
      const currentHour = localDate.getHours();
      const currentMin = localDate.getMinutes();
      const currentTimeStr = `${String(currentHour).padStart(2, '0')}:${String(currentMin).padStart(2, '0')}`;

      const thresholdMins = 9 * 60 + 30; // 09:30 AM
      const currentTotalMins = currentHour * 60 + currentMin;
      const lateMinutes = Math.max(0, currentTotalMins - thresholdMins);

      let status = 'Present';
      let isLate = false;
      let checkInApprovalStatus = 'Not Required';
      let approvalRequestedAt = null;
      let exceptionType = 'None';
      let originalStatus = null;

      if (currentTimeStr >= '13:30') {
        isLate = true;
        checkInApprovalStatus = 'Pending';
        approvalRequestedAt = now;
        exceptionType = 'Half Day';
        status = 'Half Day';
      } else if (currentTimeStr >= '09:31') {
        isLate = true;
        checkInApprovalStatus = 'Pending';
        approvalRequestedAt = now;
        exceptionType = 'Late';
        status = 'Late';
      }

      if (!attendance) {
        attendance = await Attendance.create({
          employeeId: employee._id,
          date: today,
          checkIn: now,
          status,
          isLate,
          lateMinutes,
          checkInApprovalStatus,
          approvalRequestedAt,
          exceptionType,
          originalStatus,
          remarks: 'QR Attendance Check-In'
        });
      } else {
        attendance.checkIn = now;
        attendance.status = status;
        attendance.isLate = isLate;
        attendance.lateMinutes = lateMinutes;
        attendance.checkInApprovalStatus = checkInApprovalStatus;
        attendance.approvalRequestedAt = approvalRequestedAt;
        attendance.exceptionType = exceptionType;
        attendance.originalStatus = originalStatus;
        attendance.remarks = 'QR Attendance Check-In';
        await attendance.save();
      }

      // Update Device Metadata & Scan History
      registeredDevice.lastUsedDate = now;
      registeredDevice.lastIpAddress = ipAddress;
      registeredDevice.scanHistory.unshift({
        scannedAt: now,
        action: 'CHECK_IN',
        status: 'Success',
        ipAddress,
        notes: `Checked in as ${status} at ${currentTimeStr}`
      });
      if (registeredDevice.scanHistory.length > 50) registeredDevice.scanHistory.pop();
      await registeredDevice.save();

      // Log in ActivityLog
      await ActivityLog.create({
        employeeId: employee._id,
        action: 'QR Check-In',
        status: 'Success',
        ipAddress,
        device: registeredDevice.deviceModel,
        browser: registeredDevice.browserName,
        location: 'Office QR Terminal'
      });

      return res.json({
        success: true,
        action: 'CHECK_IN',
        greeting,
        message: 'Your check-in has been successfully recorded.',
        employee: {
          id: employee._id,
          empCode: employee.empCode,
          name: employee.fullName,
          profileImage: employee.profileImage,
          department: employee.department
        },
        attendance: {
          date: today,
          checkIn: attendance.checkIn,
          status: attendance.status,
          isLate: attendance.isLate,
          lateMinutes: attendance.lateMinutes
        }
      });
    }

    // ─────────────────────────────────────────────────────────────
    // SCENARIO 2: SECOND SCAN -> RECORD CHECK-OUT
    // ─────────────────────────────────────────────────────────────
    if (attendance.checkIn && !attendance.checkOut) {
      // Debounce: prevent duplicate scan within 60 seconds of checking in
      const secondsSinceCheckIn = (now.getTime() - new Date(attendance.checkIn).getTime()) / 1000;
      if (secondsSinceCheckIn < 60) {
        return res.json({
          success: true,
          action: 'CHECK_IN',
          greeting,
          alreadyCheckedIn: true,
          message: 'You have just checked in moments ago. Welcome!',
          employee: {
            id: employee._id,
            empCode: employee.empCode,
            name: employee.fullName,
            profileImage: employee.profileImage
          },
          attendance: {
            date: today,
            checkIn: attendance.checkIn,
            status: attendance.status
          }
        });
      }

      attendance.checkOut = now;
      attendance.workStatus = 'Completed';
      attendance.lastExitTime = null;

      const calc = calculateAttendanceStatus(attendance, { currentTime: now });
      attendance.status = calc.status;
      attendance.workHours = calc.workHours;
      attendance.overtime = calc.overtime;
      attendance.totalWorkingSeconds = calc.workingSeconds;
      attendance.totalOvertimeSeconds = calc.overtimeSeconds;

      const fullDayThresholdSec = (ATTENDANCE_CONFIG.FULL_DAY_THRESHOLD_MINUTES || 495) * 60;
      if (calc.workingSeconds < fullDayThresholdSec) {
        if (attendance.checkInApprovalStatus === 'Not Required') {
          attendance.status = calc.status;
          attendance.exceptionType = calc.status === 'Absent' ? 'Absent' : 'Half Day';
          attendance.checkInApprovalStatus = 'Pending';
          attendance.approvalRequestedAt = now;
        } else if (attendance.checkInApprovalStatus === 'Pending' && attendance.exceptionType === 'Late') {
          attendance.exceptionType = calc.status === 'Absent' ? 'Absent' : 'Half Day';
          attendance.status = calc.status;
        }
      }

      await attendance.save();

      // Update Device Metadata & Scan History
      registeredDevice.lastUsedDate = now;
      registeredDevice.lastIpAddress = ipAddress;
      registeredDevice.scanHistory.unshift({
        scannedAt: now,
        action: 'CHECK_OUT',
        status: 'Success',
        ipAddress,
        notes: `Checked out with ${calc.workHours} work hours`
      });
      if (registeredDevice.scanHistory.length > 50) registeredDevice.scanHistory.pop();
      await registeredDevice.save();

      // Log in ActivityLog
      await ActivityLog.create({
        employeeId: employee._id,
        action: 'QR Check-Out',
        status: 'Success',
        ipAddress,
        device: registeredDevice.deviceModel,
        browser: registeredDevice.browserName,
        location: 'Office QR Terminal'
      });

      return res.json({
        success: true,
        action: 'CHECK_OUT',
        greeting,
        message: 'Your check-out has been successfully recorded.',
        employee: {
          id: employee._id,
          empCode: employee.empCode,
          name: employee.fullName,
          profileImage: employee.profileImage,
          department: employee.department
        },
        attendance: {
          date: today,
          checkIn: attendance.checkIn,
          checkOut: attendance.checkOut,
          workHours: attendance.workHours,
          totalWorkingSeconds: attendance.totalWorkingSeconds,
          status: attendance.status
        }
      });
    }

    // ─────────────────────────────────────────────────────────────
    // SCENARIO 3: THIRD SCAN -> TODAY'S ATTENDANCE ALREADY COMPLETED
    // ─────────────────────────────────────────────────────────────
    registeredDevice.scanHistory.unshift({
      scannedAt: now,
      action: 'ALREADY_COMPLETED',
      status: 'Info',
      ipAddress,
      notes: `Scanned after shift completion (${attendance.workHours})`
    });
    if (registeredDevice.scanHistory.length > 50) registeredDevice.scanHistory.pop();
    await registeredDevice.save();

    return res.json({
      success: true,
      action: 'ALREADY_COMPLETED',
      greeting,
      message: "Today's attendance is already completed!",
      employee: {
        id: employee._id,
        empCode: employee.empCode,
        name: employee.fullName,
        profileImage: employee.profileImage
      },
      attendance: {
        date: today,
        checkIn: attendance.checkIn,
        checkOut: attendance.checkOut,
        workHours: attendance.workHours,
        status: attendance.status
      }
    });

  } catch (error) {
    console.error('[scanQrAttendance Error]:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * 4. FIRST-TIME REGISTRATION & BINDING
 * Authenticates employee, binds mobile device credential, and records check-in.
 */
export const registerDeviceAndCheckIn = async (req, res) => {
  const { qrToken, loginId, password, clientInfo } = req.body;
  const ipAddress = req.headers['x-forwarded-for'] || req.socket.remoteAddress || '';
  const userAgentStr = req.headers['user-agent'] || '';

  // 1. Verify QR token
  if (!qrToken) {
    return res.status(400).json({ success: false, message: 'QR token is required. Please scan again.' });
  }
  try {
    const decoded = jwt.verify(qrToken, JWT_SECRET);
    if (decoded.type !== 'OFFICE_QR_ATTENDANCE') {
      return res.status(400).json({ success: false, message: 'Invalid QR token' });
    }
  } catch (err) {
    return res.status(401).json({ 
      success: false, 
      expired: true, 
      message: 'QR code has expired. Please scan the latest code on the office display.' 
    });
  }

  // 2. Validate Credentials
  const cleanLoginId = (loginId || '').trim();
  const cleanPassword = (password || '').trim();

  if (!cleanLoginId || !cleanPassword) {
    return res.status(400).json({ success: false, message: 'Employee Code and Password are required.' });
  }

  try {
    const emailRegex = new RegExp(`^${cleanLoginId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i');
    const compactId = cleanLoginId.replace(/[-_\s]/g, '');
    const hyphenId = cleanLoginId.includes('-')
      ? cleanLoginId
      : cleanLoginId.replace(/^([A-Za-z]+)(\d+)$/, '$1-$2');
    const altCode = cleanLoginId.toUpperCase().startsWith('OG')
      ? cleanLoginId.replace(/^OG/i, 'DB')
      : cleanLoginId.replace(/^DB/i, 'OG');

    const employee = await Employee.findOne({
      $or: [
        { email: emailRegex },
        { empCode: new RegExp(`^${cleanLoginId}$`, 'i') },
        { empCode: new RegExp(`^${compactId}$`, 'i') },
        { empCode: new RegExp(`^${hyphenId}$`, 'i') },
        { empCode: new RegExp(`^${altCode}$`, 'i') }
      ]
    });

    if (!employee) {
      return res.status(401).json({ success: false, message: 'Invalid employee credentials.' });
    }

    const isMatch = employee.password === cleanPassword ||
      (employee.password && employee.password.startsWith('$2') && await bcrypt.compare(cleanPassword, employee.password));

    if (!isMatch) {
      return res.status(401).json({ success: false, message: 'Invalid employee credentials.' });
    }

    if (employee.status !== 'Active') {
      return res.status(403).json({ success: false, message: 'Your employee account is inactive. Please contact HR.' });
    }

    // 3. Enforce: Only ONE active registered mobile device per employee
    const existingActiveDevice = await RegisteredDevice.findOne({
      employeeId: employee._id,
      status: 'Active'
    });

    if (existingActiveDevice) {
      return res.status(409).json({
        success: false,
        hasExistingDevice: true,
        message: `A mobile device (${existingActiveDevice.deviceModel || 'Mobile Phone'}) is already registered for ${employee.fullName}. Only one active device is permitted. Please contact Admin/HR to reset your device.`
      });
    }

    // 4. Generate Cryptographically Secure Device Token
    const rawDeviceCredential = crypto.randomBytes(32).toString('hex');
    const deviceTokenHash = hashDeviceToken(rawDeviceCredential);

    const { os, browser, model } = parseUserAgent(userAgentStr, clientInfo);

    // 5. Create Registered Device
    const newDevice = await RegisteredDevice.create({
      employeeId: employee._id,
      deviceTokenHash,
      deviceModel: model,
      operatingSystem: os,
      browserName: browser,
      registrationDate: new Date(),
      lastUsedDate: new Date(),
      lastIpAddress: ipAddress,
      status: 'Active',
      scanHistory: [{
        scannedAt: new Date(),
        action: 'CHECK_IN',
        status: 'Success',
        ipAddress,
        notes: 'Initial device registration and check-in'
      }]
    });

    // 6. Record Check-In
    const now = new Date();
    const today = getTodayDateIST();
    const tzStr = now.toLocaleString('en-US', { timeZone: 'Asia/Kolkata' });
    const localDate = new Date(tzStr);

    let attendance = await Attendance.findOne({ employeeId: employee._id, date: today });
    const greeting = getGreetingIST();

    if (!attendance || !attendance.checkIn) {
      const currentHour = localDate.getHours();
      const currentMin = localDate.getMinutes();
      const currentTimeStr = `${String(currentHour).padStart(2, '0')}:${String(currentMin).padStart(2, '0')}`;

      const thresholdMins = 9 * 60 + 30; // 09:30 AM
      const currentTotalMins = currentHour * 60 + currentMin;
      const lateMinutes = Math.max(0, currentTotalMins - thresholdMins);

      let status = 'Present';
      let isLate = false;
      let checkInApprovalStatus = 'Not Required';
      let approvalRequestedAt = null;
      let exceptionType = 'None';

      if (currentTimeStr >= '13:30') {
        isLate = true;
        checkInApprovalStatus = 'Pending';
        approvalRequestedAt = now;
        exceptionType = 'Half Day';
        status = 'Half Day';
      } else if (currentTimeStr >= '09:31') {
        isLate = true;
        checkInApprovalStatus = 'Pending';
        approvalRequestedAt = now;
        exceptionType = 'Late';
        status = 'Late';
      }

      if (!attendance) {
        attendance = await Attendance.create({
          employeeId: employee._id,
          date: today,
          checkIn: now,
          status,
          isLate,
          lateMinutes,
          checkInApprovalStatus,
          approvalRequestedAt,
          exceptionType,
          remarks: 'First-Time Device Registration & Check-In'
        });
      } else {
        attendance.checkIn = now;
        attendance.status = status;
        attendance.isLate = isLate;
        attendance.lateMinutes = lateMinutes;
        attendance.checkInApprovalStatus = checkInApprovalStatus;
        attendance.approvalRequestedAt = approvalRequestedAt;
        attendance.exceptionType = exceptionType;
        attendance.remarks = 'First-Time Device Registration & Check-In';
        await attendance.save();
      }
    }

    // 7. Log to ActivityLog
    await ActivityLog.create({
      employeeId: employee._id,
      action: 'Register Device & Check-In',
      status: 'Success',
      ipAddress,
      device: model,
      browser,
      location: 'Office QR Terminal'
    });

    return res.json({
      success: true,
      deviceCredential: rawDeviceCredential,
      deviceRegistered: true,
      action: 'CHECK_IN',
      greeting,
      message: 'Your mobile device has been successfully registered for QR attendance!',
      employee: {
        id: employee._id,
        empCode: employee.empCode,
        name: employee.fullName,
        profileImage: employee.profileImage,
        department: employee.department
      },
      attendance: {
        date: today,
        checkIn: attendance.checkIn,
        status: attendance.status,
        isLate: attendance.isLate,
        lateMinutes: attendance.lateMinutes
      }
    });

  } catch (error) {
    console.error('[registerDeviceAndCheckIn Error]:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * ─────────────────────────────────────────────────────────────────
 * ADMIN MANAGEMENT CONTROLLERS
 * ─────────────────────────────────────────────────────────────────
 */

/**
 * GET ALL REGISTERED DEVICES & EMPLOYEES
 */
export const getAdminDevices = async (req, res) => {
  try {
    const { search = '', status = '', os = '' } = req.query;

    const allEmployees = await Employee.find({ status: 'Active' })
      .select('fullName empCode department role profileImage joinDate email')
      .sort({ fullName: 1 });

    const allDevices = await RegisteredDevice.find().populate('employeeId', 'fullName empCode department role profileImage email');

    // Create a map by employeeId
    const deviceMap = new Map();
    allDevices.forEach(d => {
      if (d.employeeId) {
        deviceMap.set(String(d.employeeId._id), d);
      }
    });

    // Combine employees with their device status
    const combinedList = allEmployees.map(emp => {
      const dev = deviceMap.get(String(emp._id));
      return {
        employeeId: emp._id,
        employeeName: emp.fullName,
        empCode: emp.empCode,
        department: emp.department,
        profileImage: emp.profileImage,
        email: emp.email,
        deviceId: dev?._id || null,
        deviceModel: dev?.deviceModel || 'None',
        operatingSystem: dev?.operatingSystem || 'None',
        browserName: dev?.browserName || 'None',
        registrationDate: dev?.registrationDate || null,
        lastUsedDate: dev?.lastUsedDate || null,
        lastIpAddress: dev?.lastIpAddress || null,
        deviceStatus: dev ? dev.status : 'Unregistered'
      };
    });

    // Filter
    let filtered = combinedList;
    if (search) {
      const s = search.toLowerCase();
      filtered = filtered.filter(item => 
        item.employeeName?.toLowerCase().includes(s) || 
        item.empCode?.toLowerCase().includes(s) ||
        item.deviceModel?.toLowerCase().includes(s)
      );
    }

    if (status && status !== 'All') {
      filtered = filtered.filter(item => item.deviceStatus.toLowerCase() === status.toLowerCase());
    }

    if (os && os !== 'All') {
      filtered = filtered.filter(item => item.operatingSystem.toLowerCase().includes(os.toLowerCase()));
    }

    // Compute summary metrics
    const totalEmployees = allEmployees.length;
    const totalRegistered = allDevices.filter(d => d.status === 'Active' || d.status === 'Blocked').length;
    const activeDevices = allDevices.filter(d => d.status === 'Active').length;
    const blockedDevices = allDevices.filter(d => d.status === 'Blocked').length;
    const unregisteredEmployees = totalEmployees - activeDevices;

    res.json({
      success: true,
      devices: filtered,
      metrics: {
        totalEmployees,
        totalRegistered,
        activeDevices,
        blockedDevices,
        unregisteredEmployees
      }
    });
  } catch (error) {
    console.error('[getAdminDevices Error]:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * GET SINGLE DEVICE DETAILS WITH SCAN HISTORY
 */
export const getAdminDeviceById = async (req, res) => {
  try {
    const { id } = req.params;
    let device = await RegisteredDevice.findById(id).populate('employeeId', 'fullName empCode department role profileImage email phone');
    if (!device) {
      // Check if ID was employee ID
      device = await RegisteredDevice.findOne({ employeeId: id }).populate('employeeId', 'fullName empCode department role profileImage email phone');
    }

    if (!device) {
      return res.status(404).json({ success: false, message: 'Device registration not found' });
    }

    res.json({
      success: true,
      device: {
        id: device._id,
        employee: device.employeeId,
        deviceModel: device.deviceModel,
        operatingSystem: device.operatingSystem,
        browserName: device.browserName,
        registrationDate: device.registrationDate,
        lastUsedDate: device.lastUsedDate,
        lastIpAddress: device.lastIpAddress,
        status: device.status,
        scanHistory: device.scanHistory || []
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * BLOCK DEVICE
 */
export const blockDevice = async (req, res) => {
  try {
    const { id } = req.params;
    const device = await RegisteredDevice.findById(id).populate('employeeId', 'fullName empCode');
    if (!device) return res.status(404).json({ success: false, message: 'Device not found' });

    device.status = 'Blocked';
    await device.save();

    await ActivityLog.create({
      action: 'Block Device',
      status: 'Success',
      employeeId: device.employeeId?._id,
      notes: `Device ${device.deviceModel} blocked by admin`
    });

    res.json({ success: true, message: `Device for ${device.employeeId?.fullName} has been blocked.` });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * UNBLOCK DEVICE
 */
export const unblockDevice = async (req, res) => {
  try {
    const { id } = req.params;
    const device = await RegisteredDevice.findById(id).populate('employeeId', 'fullName empCode');
    if (!device) return res.status(404).json({ success: false, message: 'Device not found' });

    device.status = 'Active';
    await device.save();

    await ActivityLog.create({
      action: 'Unblock Device',
      status: 'Success',
      employeeId: device.employeeId?._id,
      notes: `Device ${device.deviceModel} unblocked by admin`
    });

    res.json({ success: true, message: `Device for ${device.employeeId?.fullName} is now Active.` });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * RESET DEVICE (Unbinds device so employee can register new mobile)
 */
export const resetDevice = async (req, res) => {
  try {
    const { id } = req.params;
    let device = await RegisteredDevice.findById(id).populate('employeeId', 'fullName empCode');
    if (!device) {
      device = await RegisteredDevice.findOne({ employeeId: id }).populate('employeeId', 'fullName empCode');
    }
    if (!device) return res.status(404).json({ success: false, message: 'Device not found' });

    const empName = device.employeeId?.fullName;
    await RegisteredDevice.findByIdAndDelete(device._id);

    await ActivityLog.create({
      action: 'Reset Registered Device',
      status: 'Success',
      employeeId: device.employeeId?._id,
      notes: `Device binding cleared for ${empName}. Eligible to register new mobile.`
    });

    res.json({ 
      success: true, 
      message: `Device binding for ${empName} was reset. The employee can now register a new mobile phone upon next scan.` 
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * REMOVE DEVICE COMPLETELY
 */
export const removeDevice = async (req, res) => {
  try {
    const { id } = req.params;
    const device = await RegisteredDevice.findById(id).populate('employeeId', 'fullName empCode');
    if (!device) return res.status(404).json({ success: false, message: 'Device not found' });

    const empName = device.employeeId?.fullName;
    await RegisteredDevice.findByIdAndDelete(id);

    await ActivityLog.create({
      action: 'Remove Registered Device',
      status: 'Success',
      employeeId: device.employeeId?._id,
      notes: `Device removed for ${empName}`
    });

    res.json({ success: true, message: `Device removed successfully for ${empName}.` });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * QR ATTENDANCE DASHBOARD STATS
 */
export const getQrStats = async (req, res) => {
  try {
    const today = getTodayDateIST();

    // 1. Devices summary
    const allDevices = await RegisteredDevice.find();
    const totalDevices = allDevices.length;
    const activeDevices = allDevices.filter(d => d.status === 'Active').length;
    const blockedDevices = allDevices.filter(d => d.status === 'Blocked').length;

    // 2. OS Breakdown
    const androidCount = allDevices.filter(d => /android/i.test(d.operatingSystem)).length;
    const iosCount = allDevices.filter(d => /ios|iphone/i.test(d.operatingSystem)).length;
    const otherOsCount = totalDevices - (androidCount + iosCount);

    // 3. Today's QR Scans & Attendance
    const todayAttendances = await Attendance.find({ date: today }).populate('employeeId', 'fullName empCode department profileImage');
    const qrAttendances = todayAttendances.filter(a => a.remarks && /qr/i.test(a.remarks));

    const checkInsToday = qrAttendances.filter(a => a.checkIn).length;
    const checkOutsToday = qrAttendances.filter(a => a.checkOut).length;
    const onTimeToday = qrAttendances.filter(a => !a.isLate && a.status === 'Present').length;
    const lateToday = qrAttendances.filter(a => a.isLate || a.status === 'Late' || a.status === 'Half Day').length;

    // 4. Live Scans Feed today from devices
    const recentScans = [];
    allDevices.forEach(d => {
      (d.scanHistory || []).forEach(sh => {
        recentScans.push({
          deviceModel: d.deviceModel,
          operatingSystem: d.operatingSystem,
          browserName: d.browserName,
          employeeId: d.employeeId,
          scannedAt: sh.scannedAt,
          action: sh.action,
          status: sh.status,
          ipAddress: sh.ipAddress,
          notes: sh.notes
        });
      });
    });

    // Populate employee details in scans
    const populatedScans = await Promise.all(
      recentScans
        .sort((a, b) => new Date(b.scannedAt) - new Date(a.scannedAt))
        .slice(0, 20)
        .map(async (scan) => {
          const emp = await Employee.findById(scan.employeeId).select('fullName empCode department profileImage');
          return {
            ...scan,
            employeeName: emp?.fullName || 'Employee',
            empCode: emp?.empCode || 'N/A',
            profileImage: emp?.profileImage || null
          };
        })
    );

    res.json({
      success: true,
      stats: {
        totalScansToday: checkInsToday + checkOutsToday,
        checkInsToday,
        checkOutsToday,
        onTimeToday,
        lateToday,
        totalDevices,
        activeDevices,
        blockedDevices,
        osBreakdown: {
          android: androidCount,
          ios: iosCount,
          other: otherOsCount
        }
      },
      recentScans: populatedScans
    });
  } catch (error) {
    console.error('[getQrStats Error]:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * GET QR SETTINGS
 */
export const getQrSettings = async (req, res) => {
  try {
    const keys = ['qr_token_expiry_seconds', 'qr_attendance_active'];
    const settings = await SystemSetting.find({ key: { $in: keys } });
    const settingsMap = settings.reduce((acc, s) => ({ ...acc, [s.key]: s.value }), {});

    res.json({
      success: true,
      settings: {
        qr_token_expiry_seconds: parseInt(settingsMap.qr_token_expiry_seconds, 10) || 60,
        qr_attendance_active: settingsMap.qr_attendance_active === 'true' || settingsMap.qr_attendance_active === true || settingsMap.qr_attendance_active === undefined
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * UPDATE QR SETTINGS
 */
export const updateQrSettings = async (req, res) => {
  try {
    const { qr_token_expiry_seconds, qr_attendance_active } = req.body;

    if (qr_token_expiry_seconds !== undefined) {
      await SystemSetting.findOneAndUpdate(
        { key: 'qr_token_expiry_seconds' },
        { value: String(qr_token_expiry_seconds) },
        { upsert: true }
      );
    }

    if (qr_attendance_active !== undefined) {
      await SystemSetting.findOneAndUpdate(
        { key: 'qr_attendance_active' },
        { value: String(qr_attendance_active) },
        { upsert: true }
      );
    }

    res.json({ success: true, message: 'QR Attendance settings updated successfully.' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};
