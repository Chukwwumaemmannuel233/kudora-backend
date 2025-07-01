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

// 🔍 Check if email exists
router.post("/check-email", async (req, res) => {
  try {
    const { email } = req.body

    if (!email) {
      return res.status(400).json({ error: "Email is required" })
    }

    console.log(`🔍 Checking email availability: ${email}`)

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

// 🔍 Check if phone exists
router.post("/check-phone", async (req, res) => {
  try {
    const { phone } = req.body

    if (!phone) {
      return res.status(400).json({ error: "Phone is required" })
    }

    console.log(`🔍 Checking phone availability: ${phone}`)

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

// 📱 Send SMS Verification Code
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

    console.log(`📱 Generating SMS code for ${phone}`)

    // Check for existing verification attempts (rate limiting)
    const recentAttempts = await pool.query(
      `SELECT COUNT(*) as count FROM phone_verifications 
       WHERE phone = $1 AND expires_at > NOW() - INTERVAL '1 hour'`,
      [phone],
    )

    if (recentAttempts.rows[0].count >= 5) {
      return res.status(429).json({
        error: "Too many verification attempts. Please try again later.",
      })
    }

    // Store verification code in your existing phone_verifications table
    await pool.query(
      `INSERT INTO phone_verifications (phone, code, expires_at) 
       VALUES ($1, $2, $3)
       ON CONFLICT (phone) 
       DO UPDATE SET code = $2, expires_at = $3`,
      [phone, verificationCode, expiresAt],
    )

    console.log(`📱 Stored verification code for ${phone}`)

    // Send SMS via Twilio
    try {
      await twilioClient.messages.create({
        body: `Your Kudora verification code is: ${verificationCode}. This code expires in 10 minutes.`,
        from: process.env.TWILIO_PHONE_NUMBER,
        to: phone,
      })

      console.log(`✅ SMS sent successfully to ${phone}`)

      res.status(200).json({
        success: true,
        message: "Verification code sent successfully",
        code_sent_at: new Date().toISOString(),
        expires_in_minutes: 10,
        // 🚨 ONLY for development - remove in production
        debug_code: process.env.NODE_ENV === "development" ? verificationCode : undefined,
      })
    } catch (twilioError) {
      console.error("❌ Twilio SMS error:", twilioError)

      if (process.env.NODE_ENV === "development") {
        res.status(200).json({
          success: true,
          message: "SMS service unavailable (dev mode)",
          debug_code: verificationCode,
          code_sent_at: new Date().toISOString(),
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

// 📱 Verify SMS Code
router.post("/verify-sms-code", async (req, res) => {
  try {
    const { phone, code } = req.body

    if (!phone || !code) {
      return res.status(400).json({ error: "Phone and code are required" })
    }

    console.log(`🔍 Verifying SMS code for ${phone}`)

    // Check verification code in your phone_verifications table
    const verification = await pool.query(
      `SELECT * FROM phone_verifications 
       WHERE phone = $1 AND code = $2 AND expires_at > NOW()`,
      [phone, code],
    )

    if (verification.rows.length === 0) {
      console.log(`❌ Invalid or expired code for ${phone}`)
      return res.status(400).json({ error: "Invalid or expired verification code" })
    }

    // Delete the verification record after successful verification
    await pool.query(`DELETE FROM phone_verifications WHERE phone = $1`, [phone])

    console.log(`✅ Phone verified successfully: ${phone}`)

    res.status(200).json({
      success: true,
      message: "Phone verified successfully",
      verified_at: new Date().toISOString(),
    })
  } catch (err) {
    console.error("❌ Verify SMS error:", err)
    res.status(500).json({ error: "Internal server error" })
  }
})

// 📷 Upload Verification Image
router.post("/upload-verification-image", async (req, res) => {
  try {
    const { imageData, imageType, userId } = req.body

    if (!imageData || !imageType) {
      return res.status(400).json({ error: "Image data and type are required" })
    }

    console.log(`📷 Uploading ${imageType} image for user ${userId}`)

    // Upload to Cloudinary
    const uploadResult = await cloudinary.uploader.upload(imageData, {
      folder: `kudora-verification/${imageType}`,
      resource_type: "image",
      format: "jpg",
      quality: "auto:good",
      transformation: [{ width: 1000, height: 1000, crop: "limit" }, { quality: "auto:good" }],
    })

    console.log(`✅ Image uploaded successfully: ${uploadResult.secure_url}`)

    // Store the URL in database if userId provided
    if (userId) {
      const columnName = `${imageType.replace("-", "_")}_url`
      await pool.query(`UPDATE buyers SET ${columnName} = $1 WHERE id = $2`, [uploadResult.secure_url, userId])
      console.log(`✅ Updated ${columnName} for user ${userId}`)
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

// 🏪 Buyer Signup Route
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
      is_captcha_verified,
      accepted_terms,
      privacy_accepted,
      marketing_accepted,
    } = req.body

    console.log("🏪 New buyer signup attempt:", {
      email,
      phone,
      first_name,
      last_name,
      is_captcha_verified,
      is_phone_verified,
    })

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
      is_captcha_verified,
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

    // Verify captcha status
    if (!is_captcha_verified) {
      return res.status(400).json({
        error: "Captcha verification is required",
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
    const hashedPassword = await bcrypt.hash(password, 12)

    // Determine status based on documents
    const hasAllDocuments = id_front_url && id_back_url && selfie_url
    const status = hasAllDocuments ? "pending" : "incomplete"

    // Insert new buyer
    const result = await pool.query(
      `INSERT INTO buyers (
        first_name, last_name, email, phone, password,
        street_address, city, state, province, zip_code, country,
        id_type, id_number, id_front_url, id_back_url, selfie_url,
        is_phone_verified, is_captcha_verified, status,
        accepted_terms, privacy_accepted, marketing_accepted,
        created_at, updated_at
      ) VALUES (
        $1, $2, $3, $4, $5,
        $6, $7, $8, $9, $10, $11,
        $12, $13, $14, $15, $16,
        $17, $18, $19,
        $20, $21, $22,
        NOW(), NOW()
      ) RETURNING id, email, first_name, last_name, status, is_captcha_verified, is_phone_verified`,
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
        is_captcha_verified || false,
        status,
        accepted_terms,
        privacy_accepted,
        marketing_accepted,
      ],
    )

    const newBuyer = result.rows[0]

    console.log(`✅ Buyer signup successful:`, {
      id: newBuyer.id,
      email: newBuyer.email,
      captcha_verified: newBuyer.is_captcha_verified,
      phone_verified: newBuyer.is_phone_verified,
      status: newBuyer.status,
    })

    res.status(201).json({
      success: true,
      message: "Signup successful! Your account is being reviewed.",
      buyer: {
        id: newBuyer.id,
        email: newBuyer.email,
        name: `${newBuyer.first_name} ${newBuyer.last_name}`,
        status: newBuyer.status,
        is_captcha_verified: newBuyer.is_captcha_verified,
        is_phone_verified: newBuyer.is_phone_verified,
      },
    })
  } catch (err) {
    console.error("❌ Signup error:", err)
    res.status(500).json({ error: "Internal server error" })
  }
})

// 📋 Get Buyer Profile
router.get("/profile/:id", async (req, res) => {
  try {
    const { id } = req.params

    const buyer = await pool.query(
      `SELECT id, first_name, last_name, email, phone, 
              street_address, city, state, province, zip_code, country,
              id_type, id_number, id_front_url, id_back_url, selfie_url,
              is_phone_verified, is_captcha_verified, status,
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

// ✅ Admin approve buyer
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

// ❌ Admin reject buyer
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

// 🔍 Admin get all buyers with captcha status and phone verification expiry
router.get("/admin/all", async (req, res) => {
  try {
    console.log("🔍 Admin fetching all buyers with verification info")

    // Get buyers with phone verification expiry time and captcha status
    const buyersQuery = await pool.query(
      `SELECT 
        b.id, b.first_name, b.last_name, b.email, b.phone, 
        b.street_address, b.city, b.state, b.province, b.zip_code, b.country,
        b.id_type, b.id_number, b.id_front_url, b.id_back_url, b.selfie_url,
        b.is_phone_verified, b.is_captcha_verified, b.status,
        b.admin_notes, b.accepted_terms, b.privacy_accepted, b.marketing_accepted,
        b.created_at, b.updated_at,
        -- Phone verification expiry info (secure - no codes)
        pv.expires_at as phone_code_expires_at,
        CASE 
          WHEN pv.expires_at > NOW() THEN 'active'
          WHEN pv.expires_at IS NOT NULL THEN 'expired'
          ELSE 'none'
        END as phone_verification_status,
        -- Calculate minutes until expiry
        CASE 
          WHEN pv.expires_at > NOW() THEN 
            EXTRACT(EPOCH FROM (pv.expires_at - NOW())) / 60
          ELSE 0
        END as minutes_until_expiry
       FROM buyers b
       LEFT JOIN phone_verifications pv ON b.phone = pv.phone
       ORDER BY b.created_at DESC`,
    )

    const buyers = buyersQuery.rows.map((buyer) => ({
      ...buyer,
      // Add computed verification summary for admin
      verification_summary: {
        phone_status: buyer.is_phone_verified
          ? "verified"
          : buyer.phone_verification_status === "active"
            ? "code_active"
            : buyer.phone_verification_status === "expired"
              ? "code_expired"
              : "not_started",
        captcha_status: buyer.is_captcha_verified ? "verified" : "not_verified",
        overall_status: buyer.status,
        documents_uploaded: !!(buyer.id_front_url && buyer.id_back_url && buyer.selfie_url),
        phone_code_active: buyer.phone_verification_status === "active",
        phone_code_expires_at: buyer.phone_code_expires_at,
        minutes_until_expiry: Math.round(buyer.minutes_until_expiry || 0),
      },
    }))

    console.log(`✅ Retrieved ${buyers.length} buyers for admin with verification info`)

    res.status(200).json({
      success: true,
      buyers: buyers,
      total: buyers.length,
    })
  } catch (err) {
    console.error("❌ Admin get all buyers error:", err)
    res.status(500).json({ error: "Internal server error" })
  }
})

// 🔄 Admin resend verification code
router.post("/:id/resend-verification", async (req, res) => {
  try {
    const { id } = req.params

    // Get buyer phone
    const buyer = await pool.query("SELECT phone FROM buyers WHERE id = $1", [id])

    if (buyer.rows.length === 0) {
      return res.status(404).json({ error: "Buyer not found" })
    }

    const phone = buyer.rows[0].phone

    // Generate new verification code
    const verificationCode = Math.floor(100000 + Math.random() * 900000).toString()
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000)

    // Update phone_verifications table
    await pool.query(
      `INSERT INTO phone_verifications (phone, code, expires_at) 
       VALUES ($1, $2, $3)
       ON CONFLICT (phone) 
       DO UPDATE SET code = $2, expires_at = $3`,
      [phone, verificationCode, expiresAt],
    )

    // Send via Twilio
    try {
      await twilioClient.messages.create({
        body: `Your Kudora verification code is: ${verificationCode}. This code expires in 10 minutes.`,
        from: process.env.TWILIO_PHONE_NUMBER,
        to: phone,
      })

      console.log(`✅ Admin resent SMS to ${phone} for buyer ${id}`)

      res.status(200).json({
        success: true,
        message: "Verification code resent successfully",
        sent_at: new Date().toISOString(),
        expires_at: expiresAt.toISOString(),
      })
    } catch (twilioError) {
      console.error("❌ Twilio error in admin resend:", twilioError)

      // For development, still return success
      if (process.env.NODE_ENV === "development") {
        res.status(200).json({
          success: true,
          message: "SMS service unavailable (dev mode)",
          debug_code: verificationCode,
          sent_at: new Date().toISOString(),
          expires_at: expiresAt.toISOString(),
        })
      } else {
        res.status(500).json({ error: "Failed to send SMS" })
      }
    }
  } catch (err) {
    console.error("❌ Admin resend verification error:", err)
    res.status(500).json({ error: "Internal server error" })
  }
})

module.exports = router
