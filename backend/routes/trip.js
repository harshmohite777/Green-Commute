const express = require("express");
const router = express.Router();
const Trip = require("../models/Trip");
const User = require("../models/User");

// ===============================
// CO2 calculation function
// ===============================
function calculateCO2(mode, distance) {
  const car = 0.21;

  const map = {
    walk: 0,
    cycle: 0,
    bus: 0.05,
    carpool: 0.1,
  };

  return (car - map[mode]) * distance;
}

// ===============================
// Check 12-hour validity
// ===============================
function isWithin12Hours(ticketTime) {
  const now = new Date();
  const ticketDate = new Date(ticketTime);

  const diff = now - ticketDate;
  const hours = diff / (1000 * 60 * 60);

  return hours <= 12;
}

// ===============================
// Add Trip (with ticket validation)
// ===============================
router.post("/add", async (req, res) => {
  try {
    const { userId, ticketNumber, ticketDateTime, startLocation, endLocation } =
      req.body;

    // ===============================
    // 1. Check duplicate ticket
    // ===============================
    const existing = await Trip.findOne({ ticketNumber });
    if (existing) {
      return res.status(400).json({
        msg: "Ticket already used",
      });
    }

    // ===============================
    // 2. Check 12-hour rule
    // ===============================
    if (!isWithin12Hours(ticketDateTime)) {
      return res.status(400).json({
        msg: "Ticket expired (more than 12 hours old)",
      });
    }

    // ===============================
    // 3. Temporary distance (later: Google API)
    // ===============================
    const distance = 10; // placeholder

    // ===============================
    // 4. Calculate CO2 + Points
    // ===============================
    const co2Saved = Number(calculateCO2("bus", distance).toFixed(2));
    const points = Number((co2Saved * 10).toFixed(2));

    // ===============================
    // 5. Save trip
    // ===============================
    const trip = new Trip({
      userId,
      ticketNumber,
      ticketDateTime,
      startLocation,
      endLocation,
      distance,
      co2Saved,
      points,
      verified: true,
    });

    await trip.save();

    // ===============================
    // 6. Update user points
    // ===============================
    await User.findByIdAndUpdate(userId, {
      $inc: { points: points },
    });

    // ===============================
    // 7. Response
    // ===============================
    res.json({
      msg: "Trip verified and added",
      co2Saved,
      points,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ===============================
// Get all trips of a user
// ===============================
router.get("/:userId", async (req, res) => {
  try {
    const trips = await Trip.find({ userId: req.params.userId });
    res.json(trips);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
