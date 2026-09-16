import mongoose from 'mongoose';
import dotenv from 'dotenv';
import connectDB from './db.js';
import Policy from './models/Policy.js';

dotenv.config();

const newContent = `OFFICE ORDER

To ensure smooth operations and maintain workplace discipline, all employees are required to adhere to the following office rules and regulations with immediate effect.

1. Office Timings

- Official office hours are 9:30 AM to 6:30 PM (Lunch Time: 1:30 PM - 2:15 PM).
- Depending on work requirements, employees may occasionally be required to extend their working hours beyond the scheduled closing time.

2. Attendance & Punctuality

- All employees must report to the office on time and mark their attendance between 9:30 AM and 9:35 AM.
- Employees are advised to arrive 5–10 minutes before the official reporting time to avoid delays.
- Attendance must be recorded only with a Blue Pen in the Attendance Register.
- The attendance register must be maintained neatly and accurately. Overwriting, cutting, or any alterations are strictly prohibited.
- Employees must ensure that both In Time and Out Time are entered before leaving the office each day.
- Any employee found making overwriting or unauthorized corrections in the attendance register will be subject to a penalty of ₹100/-.

3. Workplace Communication

- To maintain a professional work environment, all employees are required to communicate in English during office hours.
- Employees who fail to comply with this policy may be subject to a penalty of ₹100 for each violation.
- All employees must wear their ID cards in the office. Failure to wear an ID card will result in a penalty of ₹100/-.
- All employees must come in uniform.
- Only on Wednesdays, casual wear is allowed.
- If anyone comes without the required uniform, a penalty of ₹500/- will be applicable.

4. Late Attendance Policy

- If an employee is late once due to a genuine reason, it will be considered only if the employee informs HR with a valid explanation.
- If an employee reports late twice, it will be treated as Half-Day Leave.
- If an employee is late three or more times in a month, one day's salary will be deducted.

5. Leave Policy

Emergency Leave:
- Employees must inform HR before office hours with a valid reason.
- Supporting documents or proof may be required if necessary.

Planned Leave:
- Employees must apply for leave at least 48 hours in advance and obtain prior approval.

Unauthorized Leave:
- If an employee takes leave without prior information or approval, it will be considered Leave Without Approval.
- One additional day's salary will be deducted along with the leave deduction.

6. General Instructions

All employees are expected to maintain professionalism, discipline, and punctuality at all times.

Your cooperation in following these policies is highly appreciated and will contribute to a positive and productive work environment.

- Mail ID - priyankanayakoditech@gmail.com
- cc - oditechofficial@gmail.com

**Director**
**P Debendra Rao**

**HR & Operation Manager**
**Priyanka Nayak**`;

const run = async () => {
  await connectDB();
  const policy = await Policy.findOneAndUpdate(
    { title: 'Office Order' },
    { content: newContent, category: 'Attendance', updatedAt: new Date() },
    { new: true, upsert: true }
  );
  console.log('Policy updated with new emails:', policy.title);
  mongoose.disconnect();
};

run().catch(console.error);
