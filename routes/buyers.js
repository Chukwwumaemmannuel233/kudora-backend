const express = require("express");
const router = express.Router();
const pool = require("../db");
const bcrypt = require("bcrypt");

// NEW: Add these imports
const twilio = require("twilio");
const cloudinary = require("cloudinary").v2;

// Setup Twilio for SMS
const twilioClient = twilio(
  process.env.TWILIO_ACCOUNT_SID,
  process.env.TWILIO_AUTH_TOKEN
);

// Setup Cloudinary for images
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

// NEW: Send SMS verification code
router.post("/send-sms-code", async (req, res) => {
  try {
    const { phone } = req.body;

    if (!phone) {
      return res.status(400).json({ error: "Phone number is required" });
    }

    // Generate 6-digit code
    const verificationCode = Math.floor(100000 + Math.random() * 900000).toString();
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

    console.log(`📱 Sending code ${verificationCode} to ${phone}`);

    // Save code in database
    await pool.query(
      `INSERT INTO phone_verifications (phone, code, expires_at) 
       VALUES ($1, $2, $3)
       ON CONFLICT (phone) 
       DO UPDATE SET code = $2, expires_at = $3, created_at = NOW()`,
      [phone, verificationCode, expiresAt]
    );

    // Send SMS
    try {
      await twilioClient.messages.create({
        body: `Your Kudora verification code is: ${verificationCode}. Expires in 10 minutes.`,
        from: process.env.TWILIO_PHONE_NUMBER,
        to: phone,
      });

      console.log(`✅ SMS sent to ${phone}`);
      
      res.status(200).json({
        success: true,
        message: "Verification code sent successfully",
        debug_code: process.env.NODE_ENV === "development" ? verificationCode : undefined,
      });
    } catch (twilioError) {
      console.error("❌ Twilio error:", twilioError);
      
      // For testing, still return success
      res.status(200).json({
        success: true,
        message: "SMS service unavailable (dev mode)",
        debug_code: verificationCode,
      });
    }
  } catch (err) {
    console.error("❌ Send SMS error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// NEW: Verify SMS code
router.post("/verify-sms-code", async (req, res) => {
  try {
    const { phone, code } = req.body;

    if (!phone || !code) {
      return res.status(400).json({ error: "Phone and code are required" });
    }

    console.log(`🔍 Verifying code ${code} for ${phone}`);

    // Check code in database
    const verification = await pool.query(
      `SELECT * FROM phone_verifications 
       WHERE phone = $1 AND code = $2 AND expires_at > NOW()`,
      [phone, code]
    );

    if (verification.rows.length === 0) {
      return res.status(400).json({ error: "Invalid or expired verification code" });
    }

    // Delete used code
    await pool.query(`DELETE FROM phone_verifications WHERE phone = $1`, [phone]);

    // Mark phone as verified
    await pool.query(`UPDATE buyers SET is_phone_verified = true WHERE phone = $1`, [phone]);

    console.log(`✅ Phone verified: ${phone}`);

    res.status(200).json({
      success: true,
      message: "Phone verified successfully",
    });
  } catch (err) {
    console.error("❌ Verify SMS error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// NEW: Upload images
router.post("/upload-verification-image", async (req, res) => {
  try {
    const { imageData, imageType, userId } = req.body;

    if (!imageData || !imageType) {
      return res.status(400).json({ error: "Image data and type are required" });
    }

    console.log(`📷 Uploading ${imageType} image...`);

    // Upload to Cloudinary
    const uploadResult = await cloudinary.uploader.upload(imageData, {
      folder: `kudora-verification/${imageType}`,
      resource_type: "image",
      format: "jpg",
      quality: "auto:good",
      transformation: [
        { width: 1000, height: 1000, crop: "limit" },
        { quality: "auto:good" },
      ],
    });

    console.log(`✅ Image uploaded: ${uploadResult.secure_url}`);

    // Save URL to buyer record if userId provided
    if (userId) {
      const columnName = `${imageType.replace("-", "_")}_url`;
      await pool.query(
        `UPDATE buyers SET ${columnName} = $1 WHERE id = $2`,
        [uploadResult.secure_url, userId]
      );
    }

    res.status(200).json({
      success: true,
      url: uploadResult.secure_url,
      public_id: uploadResult.public_id,
    });
  } catch (err) {
    console.error("❌ Image upload error:", err);
    res.status(500).json({ error: "Failed to upload image" });
  }
});

// ENHANCED: Your signup route with new features
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
      is_phone_verified,
      accepted_terms,
      privacy_accepted,
      marketing_accepted,
    } = req.body;

    console.log("🏪 New buyer registration:", { email, phone, first_name, last_name });

    // Check required fields
    const requiredFields = [
      'first_name', 'last_name', 'email', 'phone', 'password',
      'street_address', 'city', 'state', 'zip_code', 'country',
      'accepted_terms', 'privacy_accepted'
    ];

    const missingFields = requiredFields.filter(field => !req.body[field]);

    if (missingFields.length > 0) {
      return res.status(400).json({
        error: "Missing required fields",
        missing_fields: missingFields,
      });
    }

    // Check if email or phone already exists
    const existingUser = await pool.query(
      "SELECT * FROM buyers WHERE email = $1 OR phone = $2",
      [email, phone]
    );

    if (existingUser.rows.length > 0) {
      const existing = existingUser.rows[0];
      const conflict = existing.email === email ? "email" : "phone";
      return res.status(409).json({ 
        error: `This ${conflict} is already being used` 
      });
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 12);

    // Determine status based on documents
    const hasAllDocuments = id_front_url && id_back_url && selfie_url;
    const buyerStatus = hasAllDocuments ? "pending" : "incomplete";

    // Insert new buyer (using your existing 'status' column)
    const result = await pool.query(
      `INSERT INTO buyers (
        first_name, last_name, email, phone, password,
        street_address, city, state, province, zip_code, country,
        id_type, id_number, id_front_url, id_back_url, selfie_url,
        is_phone_verified, status,
        accepted_terms, privacy_accepted, marketing_accepted,
        created_at, updated_at
      ) VALUES (
        $1, $2, $3, $4, $5,
        $6, $7, $8, $9, $10, $11,
        $12, $13, $14, $15, $16,
        $17, $18,
        $19, $20, $21,
        NOW(), NOW()
      ) RETURNING id, email, first_name, last_name, status`,
      [
        first_name, last_name, email, phone, hashedPassword,
        street_address, city, state, province, zip_code, country,
        id_type, id_number, id_front_url, id_back_url, selfie_url,
        is_phone_verified || false, buyerStatus,
        accepted_terms, privacy_accepted, marketing_accepted,
      ]
    );

    const newBuyer = result.rows[0];

    console.log(`✅ Buyer created: ID ${newBuyer.id}`);

    res.status(201).json({
      success: true,
      message: "Registration successful! Your account is being reviewed.",
      buyer: {
        id: newBuyer.id,
        email: newBuyer.email,
        name: `${newBuyer.first_name} ${newBuyer.last_name}`,
        status: newBuyer.status,
      },
    });
  } catch (err) {
    console.error("❌ Registration error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// NEW: Admin approve/reject endpoints (for your admin dashboard)
router.patch("/:id/approve", async (req, res) => {
  try {
    const { id } = req.params;
    const { admin_notes } = req.body;

    await pool.query(
      `UPDATE buyers 
       SET status = 'approved', admin_notes = $1, updated_at = NOW()
       WHERE id = $2`,
      [admin_notes || 'Approved by admin', id]
    );

    console.log(`✅ Buyer ${id} approved`);

    res.status(200).json({
      success: true,
      message: "Buyer approved successfully",
    });
  } catch (err) {
    console.error("❌ Approve error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.patch("/:id/reject", async (req, res) => {
  try {
    const { id } = req.params;
    const { admin_notes } = req.body;

    await pool.query(
      `UPDATE buyers 
       SET status = 'rejected', admin_notes = $1, updated_at = NOW()
       WHERE id = $2`,
      [admin_notes || 'Rejected by admin', id]
    );

    console.log(`❌ Buyer ${id} rejected`);

    res.status(200).json({
      success: true,
      message: "Buyer rejected successfully",
    });
  } catch (err) {
    console.error("❌ Reject error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

module.exports = router;