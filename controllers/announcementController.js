import Announcement from '../models/Announcement.js';
import Holiday from '../models/Holiday.js';
import { getIo } from '../socket.js';
import { processHolidayNotifications } from '../workers/holidayNotificationWorker.js';

// Auto expire old announcements
const checkAndExpireAnnouncements = async () => {
  try {
    const now = new Date();
    await Announcement.updateMany(
      { validUntil: { $lt: now }, status: 'Active' },
      { status: 'Expired' }
    );
  } catch (error) {
    console.error('Error auto-expiring announcements:', error);
  }
};

export const createAnnouncement = async (req, res) => {
  try {
    const { title, description, priority, validUntil } = req.body;
    
    if (!title || !description || !validUntil) {
      return res.status(400).json({ success: false, message: 'Missing required fields.' });
    }

    const newAnnouncement = await Announcement.create({
      title,
      description,
      priority: priority || 'Normal',
      validUntil: new Date(validUntil),
      createdBy: req.user ? req.user.id : null,
      status: 'Active'
    });

    if (newAnnouncement.priority === 'Holiday') {
      const holidayDateStr = new Date(validUntil).toISOString().split('T')[0];
      
      await Holiday.findOneAndUpdate(
        { holidayDate: holidayDateStr },
        { 
          announcementId: newAnnouncement._id,
          holidayName: newAnnouncement.title,
          isHoliday: true
        },
        { upsert: true, new: true }
      );
      
      const io = getIo();
      if (io) {
        io.emit('holidayUpdated', { message: 'New holiday created', date: holidayDateStr });
      }

      // Background process: Dispatch notifications asynchronously
      processHolidayNotifications(newAnnouncement, 'created');
    }

    const io = getIo();
    if (io) {
      io.emit('announcementCreated', newAnnouncement);
    }

    res.status(201).json({ success: true, message: 'Announcement published successfully.', announcement: newAnnouncement });
  } catch (error) {
    console.error('Error creating announcement:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

export const getAnnouncements = async (req, res) => {
  try {
    await checkAndExpireAnnouncements();
    const announcements = await Announcement.find().sort({ createdAt: -1 });
    res.status(200).json({ success: true, announcements });
  } catch (error) {
    console.error('Error fetching announcements:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

export const getActiveAnnouncements = async (req, res) => {
  try {
    await checkAndExpireAnnouncements();
    const announcements = await Announcement.find({ status: 'Active' })
      .sort({ createdAt: -1 });

    // Custom sort: Holiday > Urgent > Normal
    const priorityOrder = { 'Holiday': 1, 'Urgent': 2, 'Normal': 3 };
    announcements.sort((a, b) => priorityOrder[a.priority] - priorityOrder[b.priority]);

    res.status(200).json({ success: true, announcements });
  } catch (error) {
    console.error('Error fetching active announcements:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

export const updateAnnouncement = async (req, res) => {
  try {
    const { id } = req.params;
    const { title, description, priority, validUntil, status } = req.body;
    
    const announcement = await Announcement.findById(id);
    if (!announcement) {
      return res.status(404).json({ success: false, message: 'Announcement not found.' });
    }

    // If it was a holiday and is changed or removed, clean up old holiday
    if (announcement.priority === 'Holiday') {
      const oldHolidayDateStr = new Date(announcement.validUntil).toISOString().split('T')[0];
      await Holiday.findOneAndDelete({ announcementId: id });
      
      const io = getIo();
      if (io) {
        io.emit('holidayUpdated', { message: 'Holiday updated/removed', date: oldHolidayDateStr });
      }
    }

    announcement.title = title || announcement.title;
    announcement.description = description || announcement.description;
    announcement.priority = priority || announcement.priority;
    announcement.validUntil = validUntil ? new Date(validUntil) : announcement.validUntil;
    if (status) {
      announcement.status = status;
    } else {
      // Re-evaluate status based on validUntil
      if (announcement.validUntil < new Date()) {
        announcement.status = 'Expired';
      } else {
        announcement.status = 'Active';
      }
    }

    await announcement.save();

    if (announcement.priority === 'Holiday' && announcement.status === 'Active') {
      const holidayDateStr = new Date(announcement.validUntil).toISOString().split('T')[0];
      await Holiday.findOneAndUpdate(
        { holidayDate: holidayDateStr },
        { 
          announcementId: announcement._id,
          holidayName: announcement.title,
          isHoliday: true
        },
        { upsert: true, new: true }
      );
      const io = getIo();
      if (io) {
        io.emit('holidayUpdated', { message: 'Holiday created', date: holidayDateStr });
      }
      // Background process: Dispatch notifications for update
      processHolidayNotifications(announcement, 'updated');
    }

    const io = getIo();
    if (io) {
      io.emit('announcementUpdated', announcement);
    }

    res.status(200).json({ success: true, message: 'Announcement updated successfully.', announcement });
  } catch (error) {
    console.error('Error updating announcement:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

export const deleteAnnouncement = async (req, res) => {
  try {
    const { id } = req.params;
    const announcement = await Announcement.findById(id);
    if (!announcement) {
      return res.status(404).json({ success: false, message: 'Announcement not found.' });
    }

    if (announcement.priority === 'Holiday') {
      const oldHolidayDateStr = new Date(announcement.validUntil).toISOString().split('T')[0];
      await Holiday.findOneAndDelete({ announcementId: id });
      const io = getIo();
      if (io) {
        io.emit('holidayUpdated', { message: 'Holiday removed', date: oldHolidayDateStr });
      }
      // Background process: Dispatch cancellation notifications
      processHolidayNotifications(announcement, 'deleted');
    }

    await Announcement.findByIdAndDelete(id);

    const io = getIo();
    if (io) {
      io.emit('announcementDeleted', { id });
    }

    res.status(200).json({ success: true, message: 'Announcement deleted successfully.' });
  } catch (error) {
    console.error('Error deleting announcement:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};
