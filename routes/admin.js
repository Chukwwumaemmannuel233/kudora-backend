const express = require("express");
const router = express.Router();
const pool = require("../db"); // Make sure this is your PostgreSQL pool config
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const verifyAdmin = require("../middleware/verifyAdmin");


// Load environment variables
require("dotenv").config();

// ✅ ADMIN LOGIN


// ✅ ADMIN LOGIN with DB
router.post("/login", async (req, res) => {
  const { username, password } = req.body;

  try {
    const result = await pool.query("SELECT * FROM admins WHERE username = $1", [username]);

    if (result.rows.length === 0) {
      return res.status(401).json({ success: false, message: "Invalid username or password" });
    }

    const admin = result.rows[0];
    const isMatch = await bcrypt.compare(password, admin.password_hash);

    if (!isMatch) {
      return res.status(401).json({ success: false, message: "Invalid username or password" });
    }

    const token = jwt.sign({ adminId: admin.id }, process.env.JWT_SECRET, { expiresIn: "2h" });

    res.json({ success: true, token });
  } catch (err) {
    console.error("Admin login error:", err);
    res.status(500).json({ success: false, message: "Server error" });
  }
});


// ✅ APPROVE A BUYER
router.patch("/buyers/:id/approve", verifyAdmin, async (req, res) => {
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
router.patch("/buyers/:id/reject", verifyAdmin, async (req, res) => {
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
router.get("/buyers", verifyAdmin, async (req, res) => {
  try {
    const result = await pool.query("SELECT * FROM buyers ORDER BY created_at DESC");
    res.status(200).json(result.rows);
  } catch (err) {
    console.error("Fetch buyers error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/waitlist", verifyAdmin, async (req, res) => {
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

// // ✅ GET ALL WAITLIST ENTRIES
// router.get("/waitlist", verifyAdmin, async (req, res) => {
//   try {
//     const result = await pool.query(
//       "SELECT id, name, email, joined_at FROM waitlist ORDER BY joined_at DESC"
//     );
//     res.status(200).json(result.rows);
//   } catch (err) {
//     console.error("Fetch waitlist error:", err);
//     res.status(500).json({ error: "Internal server error" });
//   }
// });


module.exports = router;