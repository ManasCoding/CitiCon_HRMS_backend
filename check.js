import('mongoose').then(async mongoose => {
  await mongoose.connect('mongodb://localhost:27017/hrms');
  const Attendance = mongoose.model('Attendance', new mongoose.Schema({}, {strict: false}), 'attendances');
  const atts = await Attendance.find({ date: { $gte: '2026-06-21', $lte: '2026-07-20' } });
  console.log('Total attendances found:', atts.length);
  console.log(atts.map(a => ({date: a.date, status: a.status})));
  process.exit(0);
}).catch(console.error);
