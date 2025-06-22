const express = require("express");
const router = express.Router();

// Load environment variables
require("dotenv").config();

// POST /admin/login
router.post("/login", (req, res) => {
  const { password } = req.body;

  if (password === process.env.ADMIN_PASSWORD) {
    return res.json({ success: true });
  }

  res.status(401).json({ success: false, message: "Invalid password" });
});

module.exports = router;
