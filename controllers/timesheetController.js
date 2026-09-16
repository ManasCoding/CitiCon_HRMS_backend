import Timesheet from '../models/Timesheet.js';
import Employee from '../models/Employee.js';
import { getIo } from '../socket.js';

// Helper to convert 'HH:MM AM/PM' to minutes from midnight
const parseTimeToMinutes = (timeStr) => {
  if (!timeStr) return 0;
  const [time, modifier] = timeStr.split(' ');
  let [hours, minutes] = time.split(':').map(Number);
  if (hours === 12) {
    hours = modifier === 'PM' ? 12 : 0;
  } else if (modifier === 'PM') {
    hours += 12;
  }
  return hours * 60 + minutes;
};

const formatMinutesToTime = (minutes) => {
  if (minutes <= 0) return '0h 0m';
  const h = Math.floor(minutes / 60);
  const m = Math.floor(minutes % 60);
  return `${h}h ${m}m`;
};

const calculateTotals = (loginTime, logoutTime) => {
  if (!loginTime || !logoutTime) return { totalHours: '0h 0m', overtime: '0h 0m' };
  
  const startMins = parseTimeToMinutes(loginTime);
  const endMins = parseTimeToMinutes(logoutTime);
  
  let diffMins = endMins - startMins;
  if (diffMins < 0) diffMins += 24 * 60; // Cross midnight
  
  // Standard day is 9 hours = 540 mins
  const standardMins = 540;
  
  let workHoursStr = formatMinutesToTime(diffMins);
  let overtimeStr = '0h 0m';
  
  if (diffMins > standardMins) {
    overtimeStr = formatMinutesToTime(diffMins - standardMins);
  }
  
  return { totalHours: workHoursStr, overtime: overtimeStr };
};

export const submitTimesheet = async (req, res) => {
  try {
    const { employeeId, date, weekStart, weekEnd, loginTime, logoutTime, hourlyTasks, dailyRemarks, weeklyRemarks } = req.body;
    
    if (!employeeId || !date) {
      return res.status(400).json({ success: false, message: 'Missing required fields' });
    }

    const employee = await Employee.findById(employeeId);
    if (!employee) {
      return res.status(404).json({ success: false, message: 'Employee not found' });
    }

    const { totalHours, overtime } = calculateTotals(loginTime, logoutTime);
    
    const timesheetData = {
      employeeId,
      employeeName: employee.fullName,
      department: employee.department || 'General',
      date,
      weekStart,
      weekEnd,
      loginTime,
      logoutTime,
      hourlyTasks: hourlyTasks || [],
      dailyRemarks,
      weeklyRemarks,
      totalHours,
      overtime,
      submissionTime: new Date(),
      status: 'Submitted'
    };

    const timesheet = await Timesheet.findOneAndUpdate(
      { employeeId, date },
      timesheetData,
      { new: true, upsert: true }
    );

    const io = getIo();
    if (io) {
      io.emit('timesheetSubmitted', timesheet);
      // For general listening
      io.emit('timesheetUpdated', timesheet);
    }

    res.status(200).json({ success: true, message: 'Timesheet submitted successfully', timesheet });
  } catch (error) {
    console.error('Error submitting timesheet:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

export const updateTimesheet = async (req, res) => {
  try {
    const { id } = req.params;
    const { loginTime, logoutTime, hourlyTasks, dailyRemarks, weeklyRemarks, status } = req.body;
    
    const timesheet = await Timesheet.findById(id);
    if (!timesheet) {
      return res.status(404).json({ success: false, message: 'Timesheet not found' });
    }

    if (loginTime) timesheet.loginTime = loginTime;
    if (logoutTime) timesheet.logoutTime = logoutTime;
    if (hourlyTasks) timesheet.hourlyTasks = hourlyTasks;
    if (dailyRemarks !== undefined) timesheet.dailyRemarks = dailyRemarks;
    if (weeklyRemarks !== undefined) timesheet.weeklyRemarks = weeklyRemarks;
    if (status) timesheet.status = status;

    const { totalHours, overtime } = calculateTotals(timesheet.loginTime, timesheet.logoutTime);
    timesheet.totalHours = totalHours;
    timesheet.overtime = overtime;

    await timesheet.save();

    const io = getIo();
    if (io) {
      io.emit('timesheetUpdated', timesheet);
    }

    res.status(200).json({ success: true, message: 'Timesheet updated successfully', timesheet });
  } catch (error) {
    console.error('Error updating timesheet:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

export const getEmployeeTimesheets = async (req, res) => {
  try {
    const { employeeId } = req.params;
    const { month, year } = req.query; // optional filtering
    
    let query = { employeeId };
    
    if (month && year) {
      // Date is stored as 'YYYY-MM-DD'
      const prefix = `${year}-${String(month).padStart(2, '0')}`;
      query.date = { $regex: `^${prefix}` };
    }

    const timesheets = await Timesheet.find(query).sort({ date: -1 });
    res.status(200).json({ success: true, timesheets });
  } catch (error) {
    console.error('Error fetching employee timesheets:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

export const getAdminTimesheets = async (req, res) => {
  try {
    const { date, department, search, status } = req.query;

    // Build query — never return 'Pending' timesheets (employee hasn't submitted)
    const query = { status: { $in: ['Submitted', 'Completed'] } };

    // If admin explicitly requests a specific status
    if (status && status !== 'All Status') {
      query.status = status;
    }

    // Date filter
    if (date) query.date = date;

    // Department filter
    if (department && department !== 'All Departments') {
      query.department = department;
    }

    let timesheets = await Timesheet.find(query)
      .populate('employeeId', 'fullName empCode department profileImage')
      .sort({ submissionTime: -1, date: -1 });

    // Search filter (by employee name or empCode)
    if (search) {
      const lower = search.toLowerCase();
      timesheets = timesheets.filter(t =>
        t.employeeName?.toLowerCase().includes(lower) ||
        t.employeeId?.empCode?.toLowerCase().includes(lower)
      );
    }

    res.status(200).json({ success: true, timesheets });
  } catch (error) {
    console.error('Error fetching admin timesheets:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

export const getTimesheetById = async (req, res) => {
  try {
    const { id } = req.params;
    const timesheet = await Timesheet.findById(id).populate('employeeId', 'fullName email empCode department profileImage role');
    
    if (!timesheet) {
      return res.status(404).json({ success: false, message: 'Timesheet not found' });
    }

    res.status(200).json({ success: true, timesheet });
  } catch (error) {
    console.error('Error fetching timesheet by id:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};
