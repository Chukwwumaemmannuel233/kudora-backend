const express = require("express")
const router = express.Router()
const pool = require("../db")
const bcrypt = require("bcrypt")

// You'll need to install these packages:
// npm install twilio cloudinary multer

const twilio = require("twilio") // For SMS
const cloudinary = require("cloudinary").v2 // For image storage

// Configure Twilio (add these to your .env file)
const twilioClient = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN)

// Configure Cloudinary (add these to your .env file)
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
})

// 🆕 NEW: Check if email exists (this was missing!)
router.post("/check-email", async (req, res) => {
  try {
    const { email } = req.body

    if (!email) {
      return res.status(400).json({ error: "Email is required" })
    }

    console.log(`🔍 Checking email availability: ${email}`)

    // Check if email already exists in database
    const existingEmail = await pool.query("SELECT id FROM buyers WHERE email = $1", [email])

    if (existingEmail.rows.length > 0) {
      console.log(`❌ Email already exists: ${email}`)
      return res.status(409).json({ error: "Email already exists" })
    }

    console.log(`✅ Email is available: ${email}`)
    res.status(200).json({
      available: true,
      message: "Email is available",
    })
  } catch (err) {
    console.error("❌ Check email error:", err)
    res.status(500).json({ error: "Internal server error" })
  }
})

// 🆕 NEW: Check if phone exists (this was missing!)
router.post("/check-phone", async (req, res) => {
  try {
    const { phone } = req.body

    if (!phone) {
      return res.status(400).json({ error: "Phone is required" })
    }

    console.log(`🔍 Checking phone availability: ${phone}`)

    // Check if phone already exists in database
    const existingPhone = await pool.query("SELECT id FROM buyers WHERE phone = $1", [phone])

    if (existingPhone.rows.length > 0) {
      console.log(`❌ Phone already exists: ${phone}`)
      return res.status(409).json({ error: "Phone already exists" })
    }

    console.log(`✅ Phone is available: ${phone}`)
    res.status(200).json({
      available: true,
      message: "Phone is available",
    })
  } catch (err) {
    console.error("❌ Check phone error:", err)
    res.status(500).json({ error: "Internal server error" })
  }
})

// 📱 NEW: Send SMS Verification Code
router.post("/send-sms-code", async (req, res) => {
  try {
    const { phone } = req.body

    if (!phone) {
      return res.status(400).json({ error: "Phone number is required" })
    }

    // Generate 6-digit verification code
    const verificationCode = Math.floor(100000 + Math.random() * 900000).toString()

    // Set expiration time (10 minutes from now)
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000)

    console.log(`📱 Generating SMS code for ${phone}: ${verificationCode}`)

    // Store verification code in database (temporary table or update buyers table)
    await pool.query(
      `INSERT INTO phone_verifications (phone, code, expires_at) 
       VALUES ($1, $2, $3)
       ON CONFLICT (phone) 
       DO UPDATE SET code = $2, expires_at = $3, created_at = NOW()`,
      [phone, verificationCode, expiresAt],
    )

    // Send SMS via Twilio
    try {
      await twilioClient.messages.create({
        body: `Your Kudora verification code is: ${verificationCode}. This code expires in 10 minutes.`,
        from: process.env.TWILIO_PHONE_NUMBER, // Your Twilio phone number
        to: phone,
      })

      console.log(`✅ SMS sent successfully to ${phone}`)

      res.status(200).json({
        success: true,
        message: "Verification code sent successfully",
        // Remove this in production - only for testing
        debug_code: process.env.NODE_ENV === "development" ? verificationCode : undefined,
      })
    } catch (twilioError) {
      console.error("❌ Twilio SMS error:", twilioError)

      // For development, still return success but log the error
      if (process.env.NODE_ENV === "development") {
        res.status(200).json({
          success: true,
          message: "SMS service unavailable (dev mode)",
          debug_code: verificationCode,
        })
      } else {
        res.status(500).json({ error: "Failed to send SMS" })
      }
    }
  } catch (err) {
    console.error("❌ Send SMS error:", err)
    res.status(500).json({ error: "Internal server error" })
  }
})

// 📱 NEW: Verify SMS Code
router.post("/verify-sms-code", async (req, res) => {
  try {
    const { phone, code } = req.body

    if (!phone || !code) {
      return res.status(400).json({ error: "Phone and code are required" })
    }

    console.log(`🔍 Verifying SMS code for ${phone}: ${code}`)

    // Check verification code in database
    const verification = await pool.query(
      `SELECT * FROM phone_verifications 
       WHERE phone = $1 AND code = $2 AND expires_at > NOW()`,
      [phone, code],
    )

    if (verification.rows.length === 0) {
      console.log(`❌ Invalid or expired code for ${phone}`)
      return res.status(400).json({ error: "Invalid or expired verification code" })
    }

    // Mark phone as verified and delete the verification record
    await pool.query(`DELETE FROM phone_verifications WHERE phone = $1`, [phone])

    // Update buyer record if exists
    await pool.query(`UPDATE buyers SET is_phone_verified = true WHERE phone = $1`, [phone])

    console.log(`✅ Phone verified successfully: ${phone}`)

    res.status(200).json({
      success: true,
      message: "Phone verified successfully",
    })
  } catch (err) {
    console.error("❌ Verify SMS error:", err)
    res.status(500).json({ error: "Internal server error" })
  }
})

// 📷 NEW: Upload Verification Image
router.post("/upload-verification-image", async (req, res) => {
  try {
    const { imageData, imageType, userId } = req.body

    if (!imageData || !imageType) {
      return res.status(400).json({ error: "Image data and type are required" })
    }

    console.log(`📷 Uploading ${imageType} image...`)

    // Upload to Cloudinary
    const uploadResult = await cloudinary.uploader.upload(imageData, {
      folder: `kudora-verification/${imageType}`,
      resource_type: "image",
      format: "jpg",
      quality: "auto:good",
      transformation: [
        { width: 1000, height: 1000, crop: "limit" }, // Limit size
        { quality: "auto:good" }, // Optimize quality
      ],
    })

    console.log(`✅ Image uploaded successfully: ${uploadResult.secure_url}`)

    // Optionally store the URL in database immediately
    if (userId) {
      const columnName = `${imageType.replace("-", "_")}_url`
      await pool.query(`UPDATE buyers SET ${columnName} = $1 WHERE id = $2`, [uploadResult.secure_url, userId])
    }

    res.status(200).json({
      success: true,
      url: uploadResult.secure_url,
      public_id: uploadResult.public_id,
    })
  } catch (err) {
    console.error("❌ Image upload error:", err)
    res.status(500).json({ error: "Failed to upload image" })
  }
})

// 🔄 ENHANCED: Buyer Signup Route with Phone Verification
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
      is_phone_verified, // NEW
      accepted_terms,
      privacy_accepted,
      marketing_accepted,
    } = req.body

    console.log("🏪 New buyer signup attempt:", { email, phone, first_name, last_name })

    // Validate required fields
    const requiredFields = {
      first_name,
      last_name,
      email,
      phone,
      password,
      street_address,
      city,
      state,
      zip_code,
      country,
      accepted_terms,
      privacy_accepted,
    }

    const missingFields = Object.entries(requiredFields)
      .filter(([key, value]) => !value)
      .map(([key]) => key)

    if (missingFields.length > 0) {
      return res.status(400).json({
        error: "Missing required fields",
        missing_fields: missingFields,
      })
    }

    // Check if email or phone already exists
    const existingUser = await pool.query("SELECT * FROM buyers WHERE email = $1 OR phone = $2", [email, phone])

    if (existingUser.rows.length > 0) {
      const existing = existingUser.rows[0]
      const conflict = existing.email === email ? "email" : "phone"
      console.log(`❌ Signup failed: ${conflict} already exists`)
      return res.status(409).json({
        error: `${conflict.charAt(0).toUpperCase() + conflict.slice(1)} already in use`,
      })
    }

    // Hash the password
    const hashedPassword = await bcrypt.hash(password, 12) // Increased salt rounds

    // Determine verification status
    const hasAllDocuments = id_front_url && id_back_url && selfie_url
    const verificationStatus = hasAllDocuments ? "pending" : "incomplete"

    // Insert new buyer with enhanced fields
    const result = await pool.query(
      `INSERT INTO buyers (
        first_name, last_name, email, phone, password,
        street_address, city, state, province, zip_code, country,
        id_type, id_number, id_front_url, id_back_url, selfie_url,
        is_phone_verified, verification_status,
        accepted_terms, privacy_accepted, marketing_accepted,
        created_at, updated_at
      ) VALUES (
        $1, $2, $3, $4, $5,
        $6, $7, $8, $9, $10, $11,
        $12, $13, $14, $15, $16,
        $17, $18,
        $19, $20, $21,
        NOW(), NOW()
      ) RETURNING id, email, first_name, last_name, verification_status`,
      [
        first_name,
        last_name,
        email,
        phone,
        hashedPassword,
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
        is_phone_verified || false,
        verificationStatus,
        accepted_terms,
        privacy_accepted,
        marketing_accepted,
      ],
    )

    const newBuyer = result.rows[0]

    console.log(`✅ Buyer signup successful: ID ${newBuyer.id}, Email: ${newBuyer.email}`)

    // Send welcome email (optional - implement later)
    // await sendWelcomeEmail(email, first_name);

    res.status(201).json({
      success: true,
      message: "Signup successful! Your account is being reviewed.",
      buyer: {
        id: newBuyer.id,
        email: newBuyer.email,
        name: `${newBuyer.first_name} ${newBuyer.last_name}`,
        verification_status: newBuyer.verification_status,
      },
    })
  } catch (err) {
    console.error("❌ Signup error:", err)
    res.status(500).json({ error: "Internal server error" })
  }
})

// 📋 NEW: Get Buyer Profile
router.get("/profile/:id", async (req, res) => {
  try {
    const { id } = req.params

    const buyer = await pool.query(
      `SELECT id, first_name, last_name, email, phone, 
              street_address, city, state, province, zip_code, country,
              id_type, id_number, is_phone_verified, verification_status,
              accepted_terms, privacy_accepted, marketing_accepted,
              created_at, updated_at
       FROM buyers WHERE id = $1`,
      [id],
    )

    if (buyer.rows.length === 0) {
      return res.status(404).json({ error: "Buyer not found" })
    }

    res.status(200).json({ buyer: buyer.rows[0] })
  } catch (err) {
    console.error("❌ Get profile error:", err)
    res.status(500).json({ error: "Internal server error" })
  }
})

// 🔄 NEW: Update Verification Status (Admin only)
router.patch("/:id/verification-status", async (req, res) => {
  try {
    const { id } = req.params
    const { status, admin_notes } = req.body

    if (!["pending", "approved", "rejected"].includes(status)) {
      return res.status(400).json({ error: "Invalid status" })
    }

    await pool.query(
      `UPDATE buyers 
       SET verification_status = $1, admin_notes = $2, updated_at = NOW()
       WHERE id = $3`,
      [status, admin_notes, id],
    )

    console.log(`🔄 Buyer ${id} verification status updated to: ${status}`)

    // Send notification email to buyer (implement later)
    // await sendVerificationStatusEmail(buyerEmail, status);

    res.status(200).json({
      success: true,
      message: `Verification status updated to ${status}`,
    })
  } catch (err) {
    console.error("❌ Update verification status error:", err)
    res.status(500).json({ error: "Internal server error" })
  }
})

// NEW: Admin approve/reject endpoints (for your admin dashboard)
router.patch("/:id/approve", async (req, res) => {
  try {
    const { id } = req.params
    const { admin_notes } = req.body

    await pool.query(
      `UPDATE buyers 
       SET status = 'approved', admin_notes = $1, updated_at = NOW()
       WHERE id = $2`,
      [admin_notes || "Approved by admin", id],
    )

    console.log(`✅ Buyer ${id} approved`)

    res.status(200).json({
      success: true,
      message: "Buyer approved successfully",
    })
  } catch (err) {
    console.error("❌ Approve error:", err)
    res.status(500).json({ error: "Internal server error" })
  }
})

router.patch("/:id/reject", async (req, res) => {
  try {
    const { id } = req.params
    const { admin_notes } = req.body

    await pool.query(
      `UPDATE buyers 
       SET status = 'rejected', admin_notes = $1, updated_at = NOW()
       WHERE id = $2`,
      [admin_notes || "Rejected by admin", id],
    )

    console.log(`❌ Buyer ${id} rejected`)

    res.status(200).json({
      success: true,
      message: "Buyer rejected successfully",
    })
  } catch (err) {
    console.error("❌ Reject error:", err)
    res.status(500).json({ error: "Internal server error" })
  }
})

module.exports = router
