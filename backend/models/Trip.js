const mongoose = require("mongoose");

const tripSchema = new mongoose.Schema({
  userId: mongoose.Schema.Types.ObjectId,

  ticketNumber: { type: String, unique: true }, // prevents reuse
  ticketDateTime: Date,

  startLocation: String,
  endLocation: String,

  distance: Number,
  co2Saved: Number,
  points: Number,

  verified: { type: Boolean, default: false },

  createdAt: { type: Date, default: Date.now },
});

module.exports = mongoose.model("Trip", tripSchema);
