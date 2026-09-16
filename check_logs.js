import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config({ path: './.env' });

mongoose.connect(process.env.MONGODB_URI)
  .then(async () => {
    const db = mongoose.connection.db;
    const logs = await db.collection('notificationlogs').find({ 
      $or: [
        { message: /69f06716d80ebc1505df601e/ },
        { message: /Manas/ }
      ]
    }).toArray();
    console.log(JSON.stringify(logs, null, 2));
    process.exit(0);
  })
  .catch(err => {
    console.error(err);
    process.exit(1);
  });
