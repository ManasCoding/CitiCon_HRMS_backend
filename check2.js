import('mongoose').then(async mongoose => {
  await mongoose.connect('mongodb://127.0.0.1:27017/hrms');
  const Attendance = mongoose.model('Attendance', new mongoose.Schema({}, {strict: false}), 'attendances');
  const atts = await Attendance.find();
  console.log('Total attendances in DB:', atts.length);
  if (atts.length > 0) {
    console.log('Sample dates:', atts.slice(0, 5).map(a => a.date));
  }
  process.exit(0);
}).catch(console.error);
