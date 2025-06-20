const express = require("express");
const cors = require("cors");
const pool = require("./db");
const waitlistRoutes = require("./routes/waitlist");

const app = express();
app.use(cors());
app.use(express.json());

// Base route
app.get("/", (req, res) => {
  res.send("Backend is running");
});

// Use /waitlist route
app.use("/waitlist", waitlistRoutes);

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
