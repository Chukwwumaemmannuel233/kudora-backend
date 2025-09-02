const express = require("express");
const router = express.Router();
const pool = require("../db");
const nodemailer = require("nodemailer");

// Load environment variables
require("dotenv").config();

// Email transporter setup
const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.ADMIN_EMAIL,
    pass: process.env.ADMIN_EMAIL_PASSWORD,
  },
});

// POST /waitlist - Add a new person to the waitlist
router.post("/", async (req, res) => {
  const { name, email } = req.body;

  try {
    const result = await pool.query(
      "INSERT INTO waitlist (name, email, joined_at) VALUES ($1, $2, NOW()) RETURNING *",
      [name, email]
    );

    const user = result.rows[0];

    // ✅ Send confirmation email to the user
    await transporter.sendMail({
      from: '"Kudora Team" <no-reply@kudora.com>',
      to: user.email,
      subject: "You're on the Kudora Waitlist!",
      html: `
        <h2>Welcome to Kudora!</h2>
        <p>Hi ${user.name || "there"}, thanks for joining our waitlist. We'll keep you updated as we launch new features.</p>
        <p>— The Kudora Team</p>
      `,
    });

    // ✅ Send notification email to the admin
    await transporter.sendMail({
      from: '"Kudora Alerts" <no-reply@kudora.com>',
      to: process.env.ADMIN_EMAIL,
      subject: "New Waitlist Entry",
      text: `Someone just joined the waitlist:\nName: ${user.name}\nEmail: ${user.email}`,
    });

    res.status(201).json({ success: true, data: user });
  } catch (err) {
    console.error("Waitlist INSERT error:", err);

    if (err.code === "23505") {
      return res.status(400).json({
        success: false,
        code: "DUPLICATE_EMAIL",
        field: "email",
        message: "This email has already been added to the waitlist.",
      });
    }

    res.status(500).json({ success: false, message: "Server Error" });
  }
});