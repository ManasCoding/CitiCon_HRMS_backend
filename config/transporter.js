import dns from "node:dns";
import nodemailer from "nodemailer";
import dotenv from 'dotenv';

dotenv.config();

// Prefer IPv4 globally
if (dns.setDefaultResultOrder) {
  dns.setDefaultResultOrder("ipv4first");
}

const transporter = nodemailer.createTransport({
  host: "smtp.gmail.com",
  port: 465,
  secure: true,

  // IMPORTANT:
  // Force DNS resolution to IPv4
  family: 4,

  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },

  connectionTimeout: 30000,
  greetingTimeout: 30000,
  socketTimeout: 60000,

  logger: true,
  debug: true,
});

transporter.verify((error, success) => {
  if (error) {
    console.error("SMTP VERIFY ERROR:");
    console.error(error);
  } else {
    console.log("SMTP READY:", success);
  }
});

export default transporter;
