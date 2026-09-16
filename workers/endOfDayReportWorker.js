import PDFDocument from 'pdfkit';
import Timesheet from '../models/Timesheet.js';
import SystemSetting from '../models/SystemSetting.js';
import { sendEmail } from '../services/notificationService.js';
import dotenv from 'dotenv';
dotenv.config();

const getTodayDateIST = () => {
  return new Date().toLocaleDateString('en-CA', { timeZone: process.env.REPORT_TIMEZONE || 'Asia/Kolkata' });
};

export const processEndOfDayReport = async () => {
  try {
    const today = getTodayDateIST();
    console.log(`[EOD Report] Starting end of day report for ${today}`);

    // Check if report already sent today
    const settingKey = 'end_of_day_report_log';
    const logSetting = await SystemSetting.findOne({ key: settingKey });
    
    if (logSetting && logSetting.value && logSetting.value.date === today && logSetting.value.status === 'Sent') {
      console.log(`[EOD Report] Report for ${today} already sent. Skipping.`);
      return;
    }

    // Fetch all work reports for today
    // Include both 'Submitted' and 'Completed' as per adminController
    const timesheets = await Timesheet.find({ 
      date: today,
      status: { $in: ['Submitted', 'Completed'] } 
    }).populate('employeeId', 'fullName empCode department');

    if (!timesheets || timesheets.length === 0) {
      console.log(`[EOD Report] No work reports found for ${today}.`);
    }

    // Generate PDF in memory
    const pdfBuffer = await new Promise((resolve, reject) => {
      try {
        const doc = new PDFDocument({ margin: 50, size: 'A4' });
        const chunks = [];

        doc.on('data', chunk => chunks.push(chunk));
        doc.on('end', () => resolve(Buffer.concat(chunks)));

        // Header
        doc.fontSize(20).text(`End of Day Work Report`, { align: 'center' });
        doc.fontSize(12).text(`Date: ${today}`, { align: 'center' });
        doc.moveDown(2);

        if (timesheets.length === 0) {
          doc.fontSize(14).text('No work reports submitted today.', { align: 'center' });
        } else {
          timesheets.forEach((ts, index) => {
            const empName = ts.employeeId?.fullName || ts.employeeName || 'Unknown';
            const empCode = ts.employeeId?.empCode || 'N/A';
            const dept = ts.department || 'General';

            doc.fontSize(14).text(`${index + 1}. ${empName} (${empCode}) - ${dept}`, { underline: true });
            doc.fontSize(10).moveDown(0.5);
            doc.text(`Login: ${ts.loginTime || 'N/A'} | Logout: ${ts.logoutTime || 'N/A'} | Total Hours: ${ts.totalHours || '0h 0m'}`);
            
            if (ts.dailyRemarks) {
              doc.moveDown(0.3);
              doc.text(`Remarks: ${ts.dailyRemarks}`);
            }

            if (ts.hourlyTasks && ts.hourlyTasks.length > 0) {
              doc.moveDown(0.3);
              doc.text('Tasks:');
              ts.hourlyTasks.forEach(task => {
                doc.text(`  • [${task.slotKey}] ${task.title} - ${task.status}`);
              });
            }

            doc.moveDown(1.5);
          });
        }

        doc.end();
      } catch (err) {
        reject(err);
      }
    });

    // Send Email
    const recipient = process.env.REPORT_EMAIL_TO;
    if (!recipient) {
      throw new Error('REPORT_EMAIL_TO environment variable is not defined.');
    }

    // Convert date format for subject/body DD-MM-YYYY
    const [year, month, day] = today.split('-');
    const formattedDate = `${day}-${month}-${year}`;

    const subject = `HRMS - End of Day Work Report - ${formattedDate}`;
    const htmlBody = `
      <p>Dear Sir,</p>
      <p>Please find attached the End of Day Work Report for ${formattedDate}.</p>
      <p>Regards,<br/>HRMS - Oditech Global</p>
    `;

    const attachments = [
      {
        filename: `Work_Report_${formattedDate}.pdf`,
        content: pdfBuffer,
        contentType: 'application/pdf'
      }
    ];

    await sendEmail(recipient, subject, htmlBody, attachments);

    // Save success log
    await SystemSetting.findOneAndUpdate(
      { key: settingKey },
      { 
        value: { 
          date: today, 
          status: 'Sent', 
          emailSentAt: new Date(),
          totalReports: timesheets.length
        } 
      },
      { upsert: true }
    );

    console.log(`[EOD Report] Successfully sent end of day report for ${today}`);

  } catch (error) {
    console.error(`[EOD Report] Error processing end of day report:`, error.message);
    // Don't mark as sent so it can be retried safely
  }
};
