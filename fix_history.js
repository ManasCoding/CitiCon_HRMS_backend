import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config({ path: './.env' });
import Employee from './models/Employee.js';

mongoose.connect(process.env.MONGODB_URI)
  .then(async () => {
    // Update Manas record with real reconstructed history
    const result = await Employee.findByIdAndUpdate(
      "69f06716d80ebc1505df601e",
      {
        $set: {
          "employmentHistory.0.empCode": "OD-IN-2542",
          "employmentHistory.0.employmentType": "Intern",
          "employmentHistory.0.designation": "Software Developer Intern",
          "employmentHistory.0.department": "Software Development",
          "employmentHistory.0.startDate": new Date("2026-04-28"),
          "employmentHistory.0.endDate": new Date("2026-08-20"),
          "employmentHistory.0.status": "Completed",
          "employmentType": "Regular"
        }
      },
      { new: true }
    );
    console.log('Updated:', JSON.stringify(result.employmentHistory, null, 2));
    process.exit(0);
  })
  .catch(err => {
    console.error(err);
    process.exit(1);
  });
