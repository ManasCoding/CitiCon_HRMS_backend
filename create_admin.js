import mongoose from 'mongoose';
import bcrypt from 'bcrypt';
import dotenv from 'dotenv';
dotenv.config();

const AdminSchema = new mongoose.Schema({
  fullName: { type: String, required: true },
  email: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  isActive: { type: Boolean, default: true }
}, { timestamps: true });

const Admin = mongoose.models.Admin || mongoose.model('Admin', AdminSchema);

async function createAdmin() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected to DB');
    const hashedPassword = await bcrypt.hash('12345678', 10);
    
    // Check if exists
    let admin = await Admin.findOne({ email: 'gumansingh.oditechglobal@gmail.com' });
    if (admin) {
      admin.password = hashedPassword;
      await admin.save();
      console.log('Admin updated');
    } else {
      admin = new Admin({
        fullName: 'Guman Singh',
        email: 'gumansingh.oditechglobal@gmail.com',
        password: hashedPassword
      });
      await admin.save();
      console.log('Admin created');
    }
    
    // Also create the CitiCon version just in case
    let admin2 = await Admin.findOne({ email: 'gumansingh.CitiCon@gmail.com' });
    if (admin2) {
      admin2.password = hashedPassword;
      await admin2.save();
    } else {
      admin2 = new Admin({
        fullName: 'Guman Singh',
        email: 'gumansingh.CitiCon@gmail.com',
        password: hashedPassword
      });
      await admin2.save();
    }
    
    console.log('Done');
    process.exit(0);
  } catch (error) {
    console.error(error);
    process.exit(1);
  }
}
createAdmin();
