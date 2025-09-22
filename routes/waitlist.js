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
    try {
      const userEmail = await resend.emails.send({
        from: "onboarding@resend.dev",
        to: user.email,
        subject: "You're on the Kudora Waitlist!",
        html: `
          <h2>Welcome to Kudora!</h2>
          <p>Hi ${user.name || "there"}, thanks for joining our waitlist. We'll keep you updated as we launch new features.</p>
          <p>— The Kudora Team</p>
        `,
      });
      console.log("✅ Confirmation email sent:", userEmail);
    } catch (emailErr) {
      console.error("❌ Failed to send confirmation email:", emailErr);
      throw new Error("User email delivery failed");
    }

    // ✅ Send notification email to the admin
    try {
      const adminEmail = await resend.emails.send({
        from: "onboarding@resend.dev",
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
      console.log("✅ Admin notification sent:", adminEmail);
    } catch (emailErr) {
      console.error("❌ Failed to send admin notification:", emailErr);
      // Don't throw here — allow user to be added even if admin alert fails
    }

    await client.query("COMMIT");
    res.status(201).json({ success: true, data: user });
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("❌ Waitlist error:", err);

    if (err.code === "23505") {
      return res.status(400).json({
        success: false,
        code: "DUPLICATE_EMAIL",
        field: "email",
        message: "This email has already been added to the waitlist.",
      });
    }

    res.status(500).json({ success: false, message: err.message || "Server Error" });
  } finally {
    client.release();
  }
});
// GET /waitlist/count - Get total number of people in the waitlist
router.get("/count", async (req, res) => {
  const client = await pool.connect();

  try {
    const result = await client.query("SELECT COUNT(*) FROM waitlist");
    const count = parseInt(result.rows[0].count, 10);

    res.setHeader("Content-Type", "application/json");
    return res.json({ success: true, total: count });
  } catch (err) {
    console.error("❌ Error fetching waitlist count:", err);
    res.status(500).json({ success: false, message: "Server Error" });
  } finally {
    client.release();
  }
});

// GET /waitlist - Get the whole waitlist with a serial number column
router.get("/", async (req, res) => {
  const client = await pool.connect();

  try {
    const result = await client.query(`
      SELECT
        ROW_NUMBER() OVER (ORDER BY joined_at ASC) AS serial,
        id,
        name,
        email,
        joined_at
      FROM waitlist
      ORDER BY joined_at ASC
    `);

    res.json({ success: true, data: result.rows });
  } catch (err) {
    console.error("❌ Error fetching waitlist:", err);
    res.status(500).json({ success: false, message: "Server Error" });
  } finally {
    client.release();
  }
});


module.exports = router;