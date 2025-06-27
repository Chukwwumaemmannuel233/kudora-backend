const express = require("express");
const router = express.Router();
const pool = require("../db");
const bcrypt = require("bcrypt");

// Buyer Signup Route
router.post("/signup", async (req, res) => {
  try {
    const {
      first_name,
      last_name,
      email,
      phone,
      password,
      street_address,
      city,
      state,
      province,
      zip_code,
      country,
      id_type,
      id_number,
      id_front_url,
      id_back_url,
      selfie_url,
      accepted_terms
    } = req.body;

    // Check if email or phone already exists
    const existingUser = await pool.query(
      "SELECT * FROM buyers WHERE email = $1 OR phone = $2",
      [email, phone]
    );

    if (existingUser.rows.length > 0) {
      return res.status(409).json({ error: "Email or phone already in use" });
    }

    // Hash the password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Insert new buyer
    await pool.query(
      `INSERT INTO buyers (
        first_name, last_name, email, phone, password,
        street_address, city, state, province, zip_code, country,
        id_type, id_number, id_front_url, id_back_url, selfie_url,
        accepted_terms
      ) VALUES (
        $1, $2, $3, $4, $5,
        $6, $7, $8, $9, $10, $11,
        $12, $13, $14, $15, $16,
        $17
      )`,
      [
        first_name, last_name, email, phone, hashedPassword,
        street_address, city, state, province, zip_code, country,
        id_type, id_number, id_front_url, id_back_url, selfie_url,
        accepted_terms
      ]
    );

    res.status(201).json({ message: "Signup successful!" });

  } catch (err) {
    console.error("Signup error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

module.exports = router;
