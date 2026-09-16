import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config({ path: './.env' });
import Employee from './models/Employee.js';

mongoose.connect(process.env.MONGODB_URI)
  .then(async () => {
    const employees = await Employee.find({});
    for (let emp of employees) {
      // If they have no history but were created before their current joinDate
      if ((!emp.employmentHistory || emp.employmentHistory.length === 0) && emp.createdAt < emp.joinDate) {
        emp.employmentHistory = [{
          empCode: "Unknown (Archived)",
          employmentType: "Intern", // Assumption based on context
          designation: "Unknown (Archived)",
          department: "Unknown (Archived)",
          startDate: emp.createdAt,
          endDate: emp.joinDate,
          status: "Completed",
          transitionType: "Joined Company"
        }];
        await emp.save();
        console.log(`Migrated history for ${emp.fullName}`);
      }
    }
    process.exit(0);
  })
  .catch(err => {
    console.error(err);
    process.exit(1);
  });
