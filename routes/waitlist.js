const express = require("express");
const router = express.Router();
const pool = require("../db");

// POST /waitlist - Add a new person to the waitlist
router.post("/", async (req, res) => {
  const { name, email } = req.body;

  try {
    const result = await pool.query(
      "INSERT INTO waitlist (name, email, joined_at) VALUES ($1, $2, NOW()) RETURNING *",
      [name, email]
    );

    res.status(201).json({ success: true, data: result.rows[0] });
  } catch (err) {
    if (err.code === "23505") {
      // Unique violation
      return res.status(400).json({
        success: false,
        code: "DUPLICATE_EMAIL",
         field: "email",
        message: "This email has already been added to the waitlist.",
      });
    }

    console.error("Unexpected error:", err);
    res.status(500).json({ success: false, message: "Server Error" });
  }
});


// GET /waitlist - Fetch all waitlist users
router.get("/", async (req, res) => {
  try {
    const result = await pool.query("SELECT * FROM waitlist ORDER BY joined_at DESC");
    res.status(200).json({
      success: true,
      data: result.rows,
    });
  } catch (err) {
    console.error("Waitlist fetch error:", err);
    res.status(500).json({ success: false, message: "Server Error" });
  }
});


module.exports = router;
