import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config({ path: './.env' });

mongoose.connect(process.env.MONGODB_URI)
  .then(async () => {
    const db = mongoose.connection.db;
    const collections = await db.listCollections().toArray();
    for (let c of collections) {
      const doc = await db.collection(c.name).findOne({ empCode: /OD-IN/ });
      if (doc) console.log('Found OD-IN in ' + c.name + ':', doc);
      
      const obj = await db.collection(c.name).findOne({ employeeId: new mongoose.Types.ObjectId("69f06716d80ebc1505df601e") });
      if (obj && obj.empCode) console.log('Found empCode for employee in ' + c.name + ':', obj.empCode);
    }
    process.exit(0);
  })
  .catch(err => {
    console.error(err);
    process.exit(1);
  });
