const express = require("express");
const router = express.Router();
const pool = require("../db");
const { Resend } = require("resend");

// Load environment variables
require("dotenv").config();

// Initialize Resend
const resend = new Resend(process.env.RESEND_API_KEY);

// POST /waitlist - Add a new person to the waitlist
router.post("/", async (req, res) => {
  const { name, email } = req.body;
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const result = await client.query(
      "INSERT INTO waitlist (name, email, joined_at) VALUES ($1, $2, NOW()) RETURNING *",
      [name, email]
    );

    const user = result.rows[0];

    // ✅ Send confirmation email to the user
    await resend.emails.send({
      from: "Kudora Team <no-reply@kudora.com>",
      to: user.email,
      subject: "You're on the Kudora Waitlist!",
      html: `
        <h2>Welcome to Kudora!</h2>
        <p>Hi ${user.name || "there"}, thanks for joining our waitlist. We'll keep you updated as we launch new features.</p>
        <p>— The Kudora Team</p>
      `,
    });

    // ✅ Send notification email to the admin
    await resend.emails.send({
      from: "Kudora Alerts <no-reply@kudora.com>",
      to: process.env.ADMIN_EMAIL,
      subject: "New Waitlist Entry",
      html: `
        <p>Someone just joined the waitlist:</p>
        <ul>
          <li><strong>Name:</strong> ${user.name}</li>
          <li><strong>Email:</strong> ${user.email}</li>
        </ul>
      `,
    });

    await client.query("COMMIT");
    res.status(201).json({ success: true, data: user });
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("Waitlist error:", err);

    if (err.code === "23505") {
      return res.status(400).json({
        success: false,
        code: "DUPLICATE_EMAIL",
        field: "email",
        message: "This email has already been added to the waitlist.",
      });
    }

    res.status(500).json({ success: false, message: "Server Error" });
  } finally {
    client.release();
  }
});

module.exports = router;