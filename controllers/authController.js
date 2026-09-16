import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import Admin from '../models/Admin.js';
import Employee from '../models/Employee.js';
import ActivityLog from '../models/ActivityLog.js';
import transporter from '../config/transporter.js';
import otpStore from '../utils/otpStore.js';
import SystemSetting from '../models/SystemSetting.js';

export const login = async (req, res) => {
  const { loginId, password, isAdmin } = req.body;
  const ipAddress = req.headers['x-forwarded-for'] || req.socket.remoteAddress || '';
  const userAgent = req.headers['user-agent'] || '';
  
  // Simple User Agent Parser for the UI
  let browser = 'Unknown Browser';
  let device = 'Unknown Device';
  
  if (userAgent.includes('Chrome')) browser = 'Chrome';
  else if (userAgent.includes('Firefox')) browser = 'Firefox';
  else if (userAgent.includes('Safari')) browser = 'Safari';
  else if (userAgent.includes('Edge')) browser = 'Edge';

  if (userAgent.includes('Windows')) device = 'Windows PC';
  else if (userAgent.includes('Macintosh')) device = 'MacBook';
  else if (userAgent.includes('iPhone')) device = 'iPhone';
  else if (userAgent.includes('Android')) device = 'Android Phone';

  try {
    if (isAdmin) {
      const admin = await Admin.findOne({ email: loginId });
      if (admin && await bcrypt.compare(password, admin.password)) {
        // Check maintenance mode for admin (only bypass gumansingh.CitiCon@gmail.com)
        const maintenanceSetting = await SystemSetting.findOne({ key: 'maintenance_mode' });
        if (maintenanceSetting && (maintenanceSetting.value === 'true' || maintenanceSetting.value === true)) {
          if (admin.email !== 'gumansingh.CitiCon@gmail.com') {
            const maintenanceMessage = await SystemSetting.findOne({ key: 'maintenance_message' });
            return res.status(503).json({
              success: false,
              message: maintenanceMessage?.value || 'System is currently undergoing maintenance. Please try again later.'
            });
          }
        }

        await ActivityLog.create({ 
          adminId: admin._id, 
          action: 'Login', 
          status: 'Success',
          ipAddress,
          device,
          browser,
          location: 'Bhubaneswar, IN' // Placeholder or use geo-ip
        });
        
        admin.lastLogin = new Date();
        await admin.save();
        
        const token = jwt.sign(
          { id: admin._id, role: 'admin' },
          process.env.JWT_SECRET || 'default_secret',
          { expiresIn: process.env.JWT_EXPIRE || '1d' }
        );

        return res.json({ 
          success: true, 
          token,
          user: { id: admin._id, name: admin.fullName, email: admin.email, role: 'admin' } 
        });
      }
    } else {
      const employee = await Employee.findOne({ $or: [{ email: loginId }, { empCode: loginId }] });
      if (employee && employee.password === password) {
        // Check maintenance mode
        const maintenanceSetting = await SystemSetting.findOne({ key: 'maintenance_mode' });
        if (maintenanceSetting && (maintenanceSetting.value === 'true' || maintenanceSetting.value === true)) {
          const maintenanceMessage = await SystemSetting.findOne({ key: 'maintenance_message' });
          return res.status(503).json({
            success: false,
            message: maintenanceMessage?.value || 'System is currently undergoing maintenance. Please try again later.'
          });
        }

        await ActivityLog.create({ 
          employeeId: employee._id, 
          action: 'Login', 
          status: 'Success',
          ipAddress,
          device,
          browser,
          location: 'Bhubaneswar, IN'
        });
        
        const token = jwt.sign(
          { id: employee._id, role: 'employee' },
          process.env.JWT_SECRET || 'default_secret',
          { expiresIn: process.env.JWT_EXPIRE || '1d' }
        );

        return res.json({ 
          success: true, 
          token,
          user: { 
            id: employee._id, 
            name: employee.fullName, 
            email: employee.email, 
            role: 'employee', 
            slug: employee.empCode 
          } 
        });
      }
      
      // Log failed attempt if employee found but wrong pass
      if (employee) {
        await ActivityLog.create({ 
          employeeId: employee._id, 
          action: 'Login', 
          status: 'Failed',
          ipAddress,
          device,
          browser,
          location: 'Bhubaneswar, IN'
        });
      }
    }
    res.status(401).json({ success: false, message: 'Invalid credentials' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

export const forgotPassword = async (req, res) => {
  const { email, isAdmin } = req.body;
  try {
    let user;
    if (isAdmin) user = await Admin.findOne({ email });
    else user = await Employee.findOne({ $or: [{ email }, { empCode: email }] });

    if (!user) return res.status(404).json({ success: false, message: 'Account not found with this email' });

    // Generate random 6-digit OTP
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    otpStore.set(user.email, otp);

    if (process.env.SMTP_USER && process.env.SMTP_PASS) {
      const fromName = process.env.FROM_NAME || 'CitiCon HRMS';
      const fromEmail = process.env.FROM_EMAIL || process.env.SMTP_USER;
      const mailOptions = {
        from: `"${fromName}" <${fromEmail}>`,
        to: user.email,
        subject: 'Your Password Reset OTP',
        html: `
          <div style="font-family: Arial, sans-serif; text-align: center; padding: 30px; background: #f8fafc; border-radius: 12px; max-width: 500px; margin: 0 auto; border: 1px solid #e2e8f0;">
            <h2 style="color: #1e293b; margin-bottom: 10px;">Password Reset Request</h2>
            <p style="color: #64748b; font-size: 15px; margin-bottom: 24px;">You requested to reset your password. Use the following 6-digit code to verify your identity:</p>
            <h1 style="font-size: 36px; letter-spacing: 8px; color: #2563eb; background: #ffffff; padding: 15px 20px; border-radius: 12px; display: inline-block; border: 2px dashed #bfdbfe; margin: 0;">${otp}</h1>
            <p style="color: #94a3b8; font-size: 13px; margin-top: 30px;">If you did not request a password reset, please ignore this email or contact support.</p>
          </div>
        `
      };
      await transporter.sendMail(mailOptions);
      res.json({ success: true, message: 'OTP sent to your email.' });
    } else {
      // Fallback for development without SMTP config
      console.log(`[SMTP MISSING] Development OTP for ${user.email}: ${otp}`);
      res.json({ success: true, message: 'OTP generated (Check console/alert)', demoOtp: otp });
    }
  } catch (error) {
    console.error('[forgot-password] Error:', error.message);
    res.status(500).json({ success: false, message: `Failed to send OTP: ${error.message}` });
  }
};

export const verifyOtp = async (req, res) => {
  const { email, otp, isAdmin } = req.body;
  try {
    let user;
    if (isAdmin) user = await Admin.findOne({ email });
    else user = await Employee.findOne({ $or: [{ email }, { empCode: email }] });
    
    if (!user) return res.status(404).json({ success: false, message: 'Account not found' });

    const storedOtp = otpStore.get(user.email);
    if (storedOtp !== otp) {
      return res.status(400).json({ success: false, message: 'Invalid verification code' });
    }

    res.json({ success: true, message: 'OTP verified' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

export const resetPassword = async (req, res) => {
  const { email, newPassword, isAdmin } = req.body;
  try {
    let userEmail, userName;

    if (isAdmin) {
      const admin = await Admin.findOne({ email });
      if (!admin) return res.status(404).json({ success: false, message: 'Admin not found' });
      admin.password = await bcrypt.hash(newPassword, 10);
      await admin.save();
      userEmail = admin.email;
      userName = admin.fullName;
    } else {
      const employee = await Employee.findOne({ $or: [{ email }, { empCode: email }] });
      if (!employee) return res.status(404).json({ success: false, message: 'Employee not found' });
      employee.password = newPassword;
      await employee.save();
      userEmail = employee.email;
      userName = employee.fullName;
    }

    // Clear OTP
    otpStore.delete(userEmail);

    // Send password-changed confirmation email
    if (process.env.SMTP_USER && process.env.SMTP_PASS) {
      const resetTime = new Date().toLocaleString('en-IN', {
        timeZone: 'Asia/Kolkata',
        dateStyle: 'medium',
        timeStyle: 'short'
      });
      const fromName = process.env.FROM_NAME || 'CitiCon Support';
      const fromEmail = process.env.FROM_EMAIL || process.env.SMTP_USER;

      try {
        await transporter.sendMail({
          from: `"${fromName}" <${fromEmail}>`,
          to: userEmail,
          subject: '✅ Your Password Has Been Reset Successfully',
          html: `
            <div style="font-family: Arial, sans-serif; background: #f8fafc; padding: 40px 20px;">
              <div style="max-width: 520px; margin: 0 auto; background: #ffffff; border-radius: 16px; overflow: hidden; border: 1px solid #e2e8f0;">
                
                <!-- Header -->
                <div style="background: linear-gradient(135deg, #1e293b 0%, #0f172a 100%); padding: 32px; text-align: center;">
                  <div style="display: inline-block; background: #22c55e; border-radius: 50%; width: 56px; height: 56px; line-height: 56px; text-align: center; font-size: 28px; margin-bottom: 12px;">✓</div>
                  <h1 style="color: #ffffff; margin: 0; font-size: 22px; font-weight: 800; letter-spacing: -0.5px;">Password Reset Successful</h1>
                  <p style="color: #94a3b8; margin: 8px 0 0; font-size: 13px;">CitiCon Pvt. Ltd. — HR Management System</p>
                </div>

                <!-- Body -->
                <div style="padding: 32px;">
                  <p style="color: #334155; font-size: 15px; margin: 0 0 8px;">Hi <strong>${userName}</strong>,</p>
                  <p style="color: #64748b; font-size: 14px; line-height: 1.6; margin: 0 0 24px;">
                    Your account password has been successfully reset. Here are the details of this action:
                  </p>

                  <!-- Info Box -->
                  <div style="background: #f1f5f9; border-left: 4px solid #22c55e; border-radius: 8px; padding: 16px 20px; margin-bottom: 24px;">
                    <table style="width: 100%; font-size: 13px; color: #475569; border-collapse: collapse;">
                      <tr>
                        <td style="padding: 4px 0; font-weight: 700; width: 40%;">Account</td>
                        <td style="padding: 4px 0; color: #1e293b;">${userEmail}</td>
                      </tr>
                      <tr>
                        <td style="padding: 4px 0; font-weight: 700;">Role</td>
                        <td style="padding: 4px 0; color: #1e293b;">${isAdmin ? 'Administrator' : 'Employee'}</td>
                      </tr>
                      <tr>
                        <td style="padding: 4px 0; font-weight: 700;">Date &amp; Time</td>
                        <td style="padding: 4px 0; color: #1e293b;">${resetTime} IST</td>
                      </tr>
                    </table>
                  </div>

                  <!-- Security Warning -->
                  <div style="background: #fff7ed; border: 1px solid #fed7aa; border-radius: 8px; padding: 14px 18px; margin-bottom: 24px;">
                    <p style="color: #c2410c; font-size: 13px; margin: 0; font-weight: 700;">⚠️ Didn't do this?</p>
                    <p style="color: #9a3412; font-size: 13px; margin: 6px 0 0; line-height: 1.5;">
                      If you did not request this change, your account may be compromised. Contact your administrator immediately at 
                      <a href="mailto:${fromEmail}" style="color: #2563eb;">${fromEmail}</a>.
                    </p>
                  </div>

                  <p style="color: #94a3b8; font-size: 12px; text-align: center; margin: 0;">
                    You can now log in using your new password.<br/>
                    This is an automated message — please do not reply.
                  </p>
                </div>

                <!-- Footer -->
                <div style="background: #f8fafc; padding: 16px; text-align: center; border-top: 1px solid #e2e8f0;">
                  <p style="color: #cbd5e1; font-size: 11px; margin: 0; text-transform: uppercase; letter-spacing: 0.1em;">
                    © ${new Date().getFullYear()} CitiCon Pvt. Ltd. — Secure HR Portal
                  </p>
                </div>

              </div>
            </div>
          `
        });
        console.log(`[reset-password] Confirmation email sent to ${userEmail}`);
      } catch (mailErr) {
        // Don't fail the whole request if confirmation email fails
        console.error('[reset-password] Confirmation email failed:', mailErr.message);
      }
    }

    res.json({ success: true, message: 'Password reset successfully' });
  } catch (error) {
    console.error('[reset-password] Error:', error.message);
    res.status(500).json({ success: false, message: error.message });
  }
};
