/**
 * Attendance System Configuration
 * Source of truth settings for work targets, lunch breaks, and overtime limits.
 */
export const ATTENDANCE_CONFIG = {
  ABSENT_THRESHOLD_MINUTES: 240,   // 4 Hours (< 4h -> ABSENT)
  FULL_DAY_THRESHOLD_MINUTES: 495, // 8 Hours 15 Minutes (4h..8h14m -> HALF DAY, >= 8h15m -> PRESENT)
  WORK_TARGET_MINUTES: 495,   // 8 Hours 15 Minutes
  LUNCH_START: '13:30',       // 01:30 PM
  LUNCH_END: '14:15',         // 02:15 PM
  MAX_OVERTIME_MINUTES: 60,   // 1 Hour
  LATE_THRESHOLD: '09:31'     // 09:31 AM
};

