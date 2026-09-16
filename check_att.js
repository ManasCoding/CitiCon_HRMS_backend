import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config({ path: './.env' });

mongoose.connect(process.env.MONGODB_URI)
  .then(async () => {
    const db = mongoose.connection.db;
    const att = await db.collection('attendances').findOne({ employeeId: new mongoose.Types.ObjectId("69f06716d80ebc1505df601e") });
    console.log(JSON.stringify(att, null, 2));
    
    // Check old employee IDs in attendance
    const allAtt = await db.collection('attendances').find({ employeeId: new mongoose.Types.ObjectId("69f06716d80ebc1505df601e") }).toArray();
    console.log("Found", allAtt.length, "attendance records");
    if (allAtt.length > 0) console.log(allAtt[0]);

    process.exit(0);
  })
  .catch(err => {
    console.error(err);
    process.exit(1);
  });
