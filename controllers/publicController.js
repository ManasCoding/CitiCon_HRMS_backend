import Notification from '../models/Notification.js';
import SystemSetting from '../models/SystemSetting.js';

export const getNotifications = async (req, res) => {
  try {
    const notices = await Notification.find({ isArchived: false }).sort({ date: -1 });
    res.json({ success: true, notifications: notices });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

export const getSettings = async (req, res) => {
  try {
    const settings = await SystemSetting.find();
    const settingsObj = settings.reduce((acc, curr) => ({ ...acc, [curr.key]: curr.value }), {});
    res.json({ success: true, settings: settingsObj });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};
