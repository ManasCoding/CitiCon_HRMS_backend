import Employee from '../models/Employee.js';
import NotificationLog from '../models/NotificationLog.js';
import { sendEmail } from '../services/notificationService.js';
import { getIo } from '../socket.js';

// Background processing for Holiday Announcements (Email only)
export const processHolidayNotifications = async (announcement, action = 'created') => {
  try {
    const employees = await Employee.find({ status: 'Active' });

    let stats = {
      total: employees.length,
      emailsSent: 0,
      failedEmails: 0
    };

    // Format holiday date nicely
    const holidayDate = new Date(announcement.validUntil).toLocaleDateString('en-GB', {
      day: 'numeric',
      month: 'long',
      year: 'numeric'
    });

    // Template text based on action type
    let actionText = 'We are pleased to inform you that the office will remain closed on';
    let subjectPrefix = 'Holiday Announcement';
    let closingNote = '🎉 Happy Holidays! Enjoy your time with family and friends.';

    if (action === 'updated') {
      actionText = 'Please note an update regarding the previously announced holiday on';
      subjectPrefix = 'Holiday Update';
      closingNote = 'Please take note of the updated holiday information.';
    } else if (action === 'deleted') {
      actionText = 'Please note that the previously announced holiday on';
      subjectPrefix = 'Holiday Cancelled';
      closingNote = '⚠️ The office will be operational as normal. Apologies for any inconvenience.';
    }

    for (const employee of employees) {
      // Create log entry
      const log = new NotificationLog({
        employeeId: employee._id,
        announcementId: announcement._id || null,
        smsStatus: 'Skipped' // SMS not enabled
      });

      // Skip if no valid email
      if (!employee.email || !employee.email.includes('@')) {
        log.emailStatus = 'Skipped';
        log.sentAt = new Date();
        await log.save();
        continue;
      }

      // Build rich HTML email body
      const emailSubject = `${subjectPrefix} - ${announcement.title}`;
      const emailBody = `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="UTF-8" />
          <style>
            body { font-family: Arial, sans-serif; background: #f4f6f8; margin: 0; padding: 0; }
            .container { max-width: 600px; margin: 30px auto; background: #ffffff; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 20px rgba(0,0,0,0.08); }
            .header { background: #1e293b; padding: 32px 40px; text-align: center; }
            .header h1 { color: #ffffff; margin: 0; font-size: 22px; font-weight: 800; letter-spacing: 1px; }
            .header p { color: #94a3b8; margin: 6px 0 0; font-size: 13px; }
            .badge { display: inline-block; margin-top: 16px; background: ${action === 'deleted' ? '#ef4444' : '#10b981'}; color: white; padding: 6px 18px; border-radius: 20px; font-size: 12px; font-weight: 700; letter-spacing: 0.5px; }
            .body { padding: 40px; }
            .greeting { font-size: 16px; color: #1e293b; font-weight: 700; margin-bottom: 16px; }
            .message { font-size: 15px; color: #475569; line-height: 1.7; margin-bottom: 24px; }
            .info-box { background: #f8fafc; border-left: 4px solid #1e293b; border-radius: 8px; padding: 20px 24px; margin-bottom: 24px; }
            .info-box h3 { margin: 0 0 8px; font-size: 14px; color: #64748b; text-transform: uppercase; letter-spacing: 1px; }
            .info-box p { margin: 0; font-size: 18px; font-weight: 800; color: #1e293b; }
            .desc-box { background: #f0fdf4; border-radius: 10px; padding: 18px 22px; margin-bottom: 24px; }
            .desc-box h3 { margin: 0 0 8px; font-size: 13px; color: #16a34a; text-transform: uppercase; font-weight: 800; letter-spacing: 1px; }
            .desc-box p { margin: 0; font-size: 14px; color: #374151; line-height: 1.6; }
            .closing { font-size: 14px; color: #64748b; line-height: 1.7; padding: 20px 0 0; border-top: 1px solid #f1f5f9; }
            .footer { background: #f8fafc; padding: 24px 40px; text-align: center; }
            .footer p { margin: 0; font-size: 12px; color: #94a3b8; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>Company HR</h1>
              <p>Human Resources Department</p>
              <span class="badge">${subjectPrefix.toUpperCase()}</span>
            </div>
            <div class="body">
              <p class="greeting">Dear ${employee.fullName},</p>
              <p class="message">
                ${actionText} <strong>${holidayDate}</strong> for <strong>${announcement.title}</strong>.
              </p>
              <div class="info-box">
                <h3>Holiday</h3>
                <p>${announcement.title}</p>
              </div>
              <div class="info-box">
                <h3>Date</h3>
                <p>${holidayDate}</p>
              </div>
              ${action !== 'deleted' ? `
              <div class="desc-box">
                <h3>Details</h3>
                <p>${announcement.description}</p>
              </div>` : ''}
              <div class="closing">
                <p>${closingNote}</p>
                <br/>
                <p>Regards,<br/><strong>HR Department</strong></p>
              </div>
            </div>
            <div class="footer">
              <p>This is an automated notification from your HR Management System. Please do not reply to this email.</p>
            </div>
          </div>
        </body>
        </html>
      `;

      // Retry logic: up to 3 attempts
      let sent = false;
      let lastError = '';
      for (let attempt = 1; attempt <= 3; attempt++) {
        try {
          await sendEmail(employee.email, emailSubject, emailBody);
          log.emailStatus = 'Sent';
          stats.emailsSent++;
          sent = true;
          break;
        } catch (error) {
          lastError = error.message;
          console.warn(`[Email] Attempt ${attempt} failed for ${employee.email}: ${error.message}`);
          if (attempt < 3) {
            // Wait 1s before retry
            await new Promise(r => setTimeout(r, 1000));
          }
        }
      }

      if (!sent) {
        log.emailStatus = 'Failed';
        log.errorMessage = lastError;
        stats.failedEmails++;
      }

      log.sentAt = new Date();
      await log.save();
    }

    console.log(`[Holiday Notifications] Done — Total: ${stats.total} | Sent: ${stats.emailsSent} | Failed: ${stats.failedEmails}`);

    // Emit summary back to all connected admin clients
    const io = getIo();
    if (io) {
      io.emit('notificationSummary', {
        title: 'Announcement Published Successfully',
        stats
      });
    }

  } catch (error) {
    console.error('Error in holiday notification worker:', error);
  }
};
