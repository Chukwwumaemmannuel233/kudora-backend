const express = require("express");
const cors = require("cors");
const pool = require("./db");
const waitlistRoutes = require("./routes/waitlist");
const adminRoutes = require("./routes/admin");
const buyerRoutes = require("./routes/buyers");

const app = express();

// ✅ Setup CORS once (at the top)
app.use(
  cors({
    origin: ["https://kudora.vercel.app"],
    methods: ["GET", "POST"],
    credentials: false,
  })
);

// ✅ Middleware
app.use(express.json());

// ✅ Routes
app.use("/admin", adminRoutes);
app.use("/buyers", buyerRoutes);
app.use("/waitlist", waitlistRoutes);

// ✅ Base route
app.get("/", (req, res) => {
  res.send("Backend is running");
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
