const express = require("express");
const router = express.Router(); // ✅ THIS WAS MISSING
const axios = require("axios");

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
// ADD TRIP
// ===============================
router.post("/add", async (req, res) => {
  try {
    const {
      userId,
      ticketNumber,
      ticketDateTime,
      startLocation,
      endLocation,
      latitude,
      longitude,
    } = req.body;

    // 1. Duplicate ticket
    const existing = await Trip.findOne({ ticketNumber });
    if (existing) {
      return res.status(400).json({ msg: "Ticket already used" });
    }

    // 2. Time validation
    if (!isWithin12Hours(ticketDateTime)) {
      return res.status(400).json({
        msg: "Ticket expired (more than 12 hours old)",
      });
    }

    // 3. GPS validation
    if (!latitude || !longitude) {
      return res.status(400).json({ msg: "Location required" });
    }

    const isValidLocation =
      latitude >= 8 && latitude <= 37 && longitude >= 68 && longitude <= 97;

    if (!isValidLocation) {
      return res.status(400).json({ msg: "Invalid location" });
    }

    // 4. Distance (controlled)
    let distance = 10;

    const routes = {
      "Pune-Mumbai": 150,
      "Mumbai-Pune": 150,
      "Delhi-Noida": 20,
    };

    const key = `${startLocation}-${endLocation}`;
    if (routes[key]) {
      distance = routes[key];
    }

    // ===============================
    // 5. CO2 + POINTS (FIXED SYSTEM)
    // ===============================
    const co2Saved = Number(calculateCO2("bus", distance).toFixed(2));

    // scalable + capped system
    let points = Math.round(co2Saved * 5);

    // minimum points
    if (points < 10) points = 10;

    // maximum cap
    if (points > 50) points = 50;

    // 6. Save trip
    const trip = new Trip({
      userId,
      ticketNumber,
      ticketDateTime,
      startLocation,
      endLocation,
      latitude,
      longitude,
      distance,
      co2Saved,
      points,
      verified: true,
    });

    await trip.save();

    // 7. Update user points
    await User.findByIdAndUpdate(userId, {
      $inc: { points: points },
    });

    // 8. Response
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
// GET USER TRIPS
// ===============================
router.get("/:userId", async (req, res) => {
  try {
    const trips = await Trip.find({ userId: req.params.userId });
    res.json(trips);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ===============================
// START JOURNEY
// ===============================
router.post("/start", async (req, res) => {
  try {
    const { userId, latitude, longitude } = req.body;

    // 1. Validate input
    if (!userId || !latitude || !longitude) {
      return res.status(400).json({ msg: "userId and location required" });
    }

    // 2. Create new trip with start data
    const trip = new Trip({
      userId,
      startLat: latitude,
      startLng: longitude,
      startTime: new Date(),
    });

    await trip.save();

    // 3. Send response with tripId
    res.json({
      msg: "Journey started",
      tripId: trip._id,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ===============================
// END JOURNEY
// ===============================
router.post("/end", async (req, res) => {
  try {
    const { tripId, latitude, longitude } = req.body;

    // 1. Validate input
    if (!tripId || !latitude || !longitude) {
      return res.status(400).json({ msg: "tripId and location required" });
    }

    // 2. Find trip
    const trip = await Trip.findById(tripId);
    if (!trip) {
      return res.status(404).json({ msg: "Trip not found" });
    }

    // 3. Save end data
    trip.endLat = latitude;
    trip.endLng = longitude;
    trip.endTime = new Date();

    // ===============================
    // 🔥 DISTANCE USING MAPBOX
    // ===============================
    const url = `https://api.mapbox.com/directions/v5/mapbox/driving/${trip.startLng},${trip.startLat};${longitude},${latitude}?access_token=${process.env.MAPBOX_TOKEN}`;

    const response = await axios.get(url);

    const distanceMeters = response.data.routes[0].distance;
    const distance = distanceMeters / 1000; // km

    // ===============================
    // 🔥 TIME CALCULATION
    // ===============================
    const duration = (trip.endTime - trip.startTime) / (1000 * 60); // minutes

    // ===============================
    // 🔥 VALIDATION
    // ===============================
    if (distance < 1) {
      return res.status(400).json({ msg: "Distance too small" });
    }

    if (duration < 5) {
      return res.status(400).json({ msg: "Trip too short" });
    }

    if (duration > 180) {
      return res.status(400).json({ msg: "Trip too long / invalid" });
    }

    // ===============================
    // 🔥 CO2 + POINTS
    // ===============================
    const co2Saved = (0.21 - 0.05) * distance;

    let points = Math.round(co2Saved * 5);

    if (points < 10) points = 10;
    if (points > 50) points = 50;

    // 4. Save results
    trip.distance = distance;
    trip.co2Saved = co2Saved;
    trip.points = points;
    trip.verified = true;

    await trip.save();

    // 5. Response
    res.json({
      msg: "Trip completed",
      distance,
      duration,
      points,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
