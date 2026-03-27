const mongoose = require("mongoose");

const tripSchema = new mongoose.Schema({
  userId: mongoose.Schema.Types.ObjectId,

  // ===============================
  // EXISTING (keep for compatibility)
  // ===============================
  ticketNumber: {
    type: String,
    unique: true,
    sparse: true, // ✅ FIX
  },
  ticketDateTime: Date,

  startLocation: String,
  endLocation: String,

  latitude: Number,
  longitude: Number,

  // ===============================
  // 🔥 NEW JOURNEY TRACKING SYSTEM
  // ===============================
  startLat: Number,
  startLng: Number,
  endLat: Number,
  endLng: Number,

  startTime: Date,
  endTime: Date,

  // ===============================
  // CALCULATED VALUES
  // ===============================
  distance: Number,
  co2Saved: Number,
  points: Number,

  verified: { type: Boolean, default: false },

  createdAt: { type: Date, default: Date.now },
});

module.exports = mongoose.model("Trip", tripSchema);
