import mongoose from 'mongoose';
import bcrypt from 'bcrypt';
import dotenv from 'dotenv';
dotenv.config();

const AdminSchema = new mongoose.Schema({
  email: String,
  password: String
});

const Admin = mongoose.models.Admin || mongoose.model('Admin', AdminSchema);

async function checkLogin() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    const admin = await Admin.findOne({ email: 'gumansingh.oditechglobal@gmail.com' });
    if (!admin) {
      console.log('Admin not found in DB');
    } else {
      console.log('Admin found:', admin.email);
      const isMatch = await bcrypt.compare('12345678', admin.password);
      console.log('Password match:', isMatch);
    }
    
    // Also check CitiCon version
    const admin2 = await Admin.findOne({ email: 'gumansingh.CitiCon@gmail.com' });
    if (!admin2) {
      console.log('CitiCon Admin not found');
    } else {
      console.log('CitiCon Admin found:', admin2.email);
      const isMatch2 = await bcrypt.compare('12345678', admin2.password);
      console.log('CitiCon Password match:', isMatch2);
    }
    process.exit(0);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
}
checkLogin();
