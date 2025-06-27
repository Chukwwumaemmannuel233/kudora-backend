const express = require("express");
const cors = require("cors");
const pool = require("./db");
const waitlistRoutes = require("./routes/waitlist");
const adminRoutes = require("./routes/admin");
const buyerRoutes = require("./routes/buyers");

// ✅ Only the origin/domain — no route paths!
const allowedOrigins = ["https://kudora.vercel.app"];

const app = express();

app.use(
  cors({
    origin: function (origin, callback) {
      if (!origin || allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        callback(new Error("Not allowed by CORS"));
      }
    },
    methods: ["GET", "POST", "PATCH", "DELETE"],
    credentials: true,
  })
);

app.use(express.json());
app.use("/admin", adminRoutes);
app.use("/buyers", buyerRoutes);
app.use("/waitlist", waitlistRoutes);

// ✅ Health check
app.get("/", (req, res) => {
  res.send("Backend is running");
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
