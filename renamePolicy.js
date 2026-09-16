import mongoose from 'mongoose';
import dotenv from 'dotenv';
import connectDB from './db.js';
import Policy from './models/Policy.js';

dotenv.config();

const run = async () => {
  await connectDB();
  const policy = await Policy.findOneAndUpdate(
    { title: 'Attendance & Leave' },
    { title: 'Office Order' },
    { new: true }
  );
  console.log('Policy title updated:', policy);
  mongoose.disconnect();
};

run().catch(console.error);
