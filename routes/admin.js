const express = require("express");
const router = express.Router();
const pool = require("../db"); // Make sure this is your PostgreSQL pool config

// Load environment variables
require("dotenv").config();

// ✅ ADMIN LOGIN
router.post("/login", (req, res) => {
  const { password } = req.body;

  if (password === process.env.ADMIN_PASSWORD) {
    return res.json({ success: true });
  }

  res.status(401).json({ success: false, message: "Invalid password" });
});

// ✅ APPROVE A BUYER
router.patch("/buyers/:id/approve", async (req, res) => {
  try {
    const { id } = req.params;
    await pool.query("UPDATE buyers SET status = 'approved' WHERE id = $1", [id]);
    res.status(200).json({ message: "Buyer approved successfully" });
  } catch (err) {
    console.error("Approve error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ✅ REJECT A BUYER
router.patch("/buyers/:id/reject", async (req, res) => {
  try {
    const { id } = req.params;
    await pool.query("UPDATE buyers SET status = 'rejected' WHERE id = $1", [id]);
    res.status(200).json({ message: "Buyer rejected successfully" });
  } catch (err) {
    console.error("Reject error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ✅ GET ALL BUYERS
router.get("/buyers", async (req, res) => {
  try {
    const result = await pool.query("SELECT * FROM buyers ORDER BY created_at DESC");
    res.status(200).json(result.rows);
  } catch (err) {
    console.error("Fetch buyers error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

