import Holiday from '../models/Holiday.js';

export const getHolidays = async (req, res) => {
  try {
    const holidays = await Holiday.find({ isHoliday: true });
    res.status(200).json({ success: true, holidays });
  } catch (error) {
    console.error('Error fetching holidays:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};
