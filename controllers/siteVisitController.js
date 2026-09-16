import SiteVisit from '../models/SiteVisit.js';
import Attendance from '../models/Attendance.js';

// Format helper
const formatDuration = (seconds) => {
  const totalMins = Math.floor(Math.max(0, seconds) / 60);
  const h = Math.floor(totalMins / 60);
  const m = totalMins % 60;
  return `${String(h).padStart(2, '0')}h ${String(m).padStart(2, '0')}m`;
};

// Create Site Visit Request
export const createSiteVisit = async (req, res) => {
  try {
    const payload = { ...req.body };
    if (!payload.endDate) {
      payload.endDate = payload.startDate;
    }
    
    // Automatically make it active and start time
    payload.status = 'Active';
    const now = new Date();
    const today = now.toISOString().split('T')[0];
    
    payload.dailyRecords = [{
      date: today,
      checkIn: now
    }];

    const newVisit = new SiteVisit(payload);
    await newVisit.save();
    res.status(201).json({ success: true, siteVisit: newVisit });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// Get all Site Visits (Admin)
export const getSiteVisits = async (req, res) => {
  try {
    const { status, employeeId, startDate, endDate } = req.query;
    let query = {};
    if (status) query.status = status;
    if (employeeId) query.employeeId = employeeId;
    if (startDate && endDate) {
      query.startDate = { $gte: startDate, $lte: endDate };
    }
    const visits = await SiteVisit.find(query)
      .populate('employeeId', 'empCode fullName profileImage department designation email')
      .sort({ createdAt: -1 });
    res.status(200).json({ success: true, siteVisits: visits });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// Get active / ongoing visits
export const getActiveVisits = async (req, res) => {
  try {
    const activeVisits = await SiteVisit.find({
      status: { $in: ['Active', 'Approved'] }
    })
      .populate('employeeId', 'empCode fullName profileImage department designation email')
      .sort({ updatedAt: -1 });

    res.status(200).json({ success: true, activeVisits });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// Get single visit
export const getSiteVisitById = async (req, res) => {
  try {
    const visit = await SiteVisit.findById(req.params.id)
      .populate('employeeId', 'empCode fullName profileImage department designation email');
    if (!visit) return res.status(404).json({ success: false, message: 'Not found' });
    res.status(200).json({ success: true, siteVisit: visit });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// Approve Site Visit
export const approveSiteVisit = async (req, res) => {
  try {
    const visit = await SiteVisit.findById(req.params.id);
    if (!visit) return res.status(404).json({ success: false, message: 'Site Visit not found' });

    const now = new Date();
    const today = now.toISOString().split('T')[0];

    // Automatically transition to Active & start visit timer upon admin approval
    visit.status = 'Active';
    visit.approvedBy = req.body.adminId;
    visit.approvedAt = now;

    let todayRecord = visit.dailyRecords.find(r => r.date === today);
    if (!todayRecord) {
      visit.dailyRecords.push({
        date: today,
        checkIn: now
      });
    } else if (!todayRecord.checkIn) {
      todayRecord.checkIn = now;
    }

    await visit.save();
    res.status(200).json({ success: true, siteVisit: visit });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// Reject Site Visit
export const rejectSiteVisit = async (req, res) => {
  try {
    const { rejectionReason, adminId } = req.body;
    const visit = await SiteVisit.findByIdAndUpdate(req.params.id, {
      status: 'Rejected',
      rejectionReason: rejectionReason || 'Rejected by Admin',
      approvedBy: adminId,
      approvedAt: new Date()
    }, { new: true });
    res.status(200).json({ success: true, siteVisit: visit });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// Start / Check In Site Visit
export const checkInSiteVisit = async (req, res) => {
  try {
    const visit = await SiteVisit.findById(req.params.id);
    if (!visit) return res.status(404).json({ success: false, message: 'Site Visit not found' });

    if (visit.status !== 'Approved' && visit.status !== 'Active') {
      return res.status(400).json({ success: false, message: 'Site visit must be approved by admin first' });
    }

    const today = new Date().toISOString().split('T')[0];
    let todayRecord = visit.dailyRecords.find(r => r.date === today);

    if (!todayRecord) {
      todayRecord = {
        date: today,
        checkIn: new Date()
      };
      visit.dailyRecords.push(todayRecord);
    } else if (!todayRecord.checkIn) {
      todayRecord.checkIn = new Date();
    }

    visit.status = 'Active';
    await visit.save();

    res.status(200).json({ success: true, siteVisit: visit });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// End Visit / Check Out Site Visit
export const checkOutSiteVisit = async (req, res) => {
  try {
    const visit = await SiteVisit.findById(req.params.id);
    if (!visit) return res.status(404).json({ success: false, message: 'Site Visit not found' });

    const now = new Date();
    const today = now.toISOString().split('T')[0];
    let todayRecord = visit.dailyRecords.find(r => r.date === today);

    let checkInTime = todayRecord?.checkIn || visit.updatedAt || visit.createdAt;
    
    if (todayRecord) {
      todayRecord.checkOut = now;
      todayRecord.workSummary = req.body.workSummary || 'Site visit completed';
    } else {
      visit.dailyRecords.push({
        date: today,
        checkIn: checkInTime,
        checkOut: now,
        workSummary: req.body.workSummary || 'Site visit completed'
      });
    }

    // Calculate time taken
    const diffMs = now.getTime() - new Date(checkInTime).getTime();
    const totalSecs = Math.max(0, Math.floor(diffMs / 1000));
    const formattedTime = formatDuration(totalSecs);

    visit.status = 'Completed';
    visit.completedAt = now;
    visit.timeTaken = formattedTime;
    visit.totalTimeSeconds = totalSecs;

    if (todayRecord) {
      todayRecord.totalHours = formattedTime;
    }

    await visit.save();

    // Sync with Attendance record
    let attendance = await Attendance.findOne({ employeeId: visit.employeeId, date: today });
    if (!attendance) {
      attendance = new Attendance({
        employeeId: visit.employeeId,
        date: today,
        checkIn: checkInTime,
        checkOut: now,
        status: 'Site Visit',
        workStatus: 'Completed',
        workHours: formattedTime
      });
      await attendance.save();
    } else {
      attendance.status = 'Site Visit';
      attendance.checkOut = now;
      attendance.workStatus = 'Completed';
      attendance.workHours = formattedTime;
      await attendance.save();
    }

    res.status(200).json({ success: true, siteVisit: visit });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// Get Employee Site Visits
export const getEmployeeSiteVisits = async (req, res) => {
  try {
    const visits = await SiteVisit.find({ employeeId: req.params.employeeId })
      .populate('employeeId', 'empCode fullName profileImage department designation email')
      .sort({ createdAt: -1 });
    res.status(200).json({ success: true, siteVisits: visits });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// Reports
export const getSiteVisitReports = async (req, res) => {
  try {
    const visits = await SiteVisit.find()
      .populate('employeeId', 'empCode fullName profileImage department designation email')
      .sort({ createdAt: -1 });
    res.status(200).json({ success: true, siteVisits: visits });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};
