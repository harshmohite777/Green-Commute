const express = require("express");
const router = express.Router();
const multer = require("multer");
const Tesseract = require("tesseract.js");
const sharp = require("sharp");

// ===============================
// Multer Setup
// ===============================
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, "uploads/");
  },
  filename: function (req, file, cb) {
    cb(null, Date.now() + "-" + file.originalname);
  },
});

const upload = multer({ storage });

// ===============================
// Helper: Marathi to English digits
// ===============================
function convertMarathiToEnglish(text) {
  const map = {
    "०": "0",
    "१": "1",
    "२": "2",
    "३": "3",
    "४": "4",
    "५": "5",
    "६": "6",
    "७": "7",
    "८": "8",
    "९": "9",
  };

  return text.replace(/[०-९]/g, (d) => map[d]);
}

// ===============================
// OCR Route
// ===============================
router.post("/scan", upload.single("ticket"), async (req, res) => {
  try {
    const imagePath = req.file.path;
    const processedPath = "uploads/processed-" + Date.now() + ".png";

    // ===============================
    // IMAGE PREPROCESSING
    // ===============================
    await sharp(imagePath)
      .rotate()
      .resize({ width: 1200 })
      .grayscale()
      .normalize()
      .sharpen()
      .threshold(150)
      .toFile(processedPath);

    // ===============================
    // OCR
    // ===============================
    const result = await Tesseract.recognize(processedPath, "eng+mar+hin", {
      tessedit_pageseg_mode: 6,
    });

    let rawText = result.data.text;

    // ===============================
    // CLEAN TEXT
    // ===============================
    let cleanedText = rawText
      .replace(/\n+/g, " ")
      .replace(/[^\w\s:/.-]/g, "")
      .replace(/\s+/g, " ")
      .trim();

    // Convert Marathi digits
    cleanedText = convertMarathiToEnglish(cleanedText);

    // Remove small noise words (safe version)
    cleanedText = cleanedText.replace(/\b[A-Za-z]{1,2}\b/g, " ");

    // ===============================
    // DATE DETECTION
    // ===============================
    const datePatterns = [
      /\d{1,2}[\/.-]\d{1,2}[\/.-]\d{2,4}/,
      /\d{1,2}\s[A-Za-z]+\s\d{2,4}/,
    ];

    let date = null;
    for (let pattern of datePatterns) {
      const match = cleanedText.match(pattern);
      if (match) {
        date = match[0];
        break;
      }
    }

    // ===============================
    // TICKET NUMBER
    // ===============================
    const numbers = cleanedText.match(/\b\d{4,}\b/g) || [];

    let ticketNumber = null;
    if (numbers.length > 0) {
      ticketNumber = numbers.sort((a, b) => b.length - a.length)[0];
    }

    // ===============================
    // LOCATION DETECTION
    // ===============================
    let startLocation = null;
    let endLocation = null;

    const toMatch = cleanedText.match(/([A-Za-z]+)\s+to\s+([A-Za-z]+)/i);

    if (toMatch) {
      startLocation = toMatch[1];
      endLocation = toMatch[2];
    } else {
      const words = cleanedText.split(" ");
      const candidates = words.filter((w) => /^[A-Z]{4,}$/.test(w));

      if (candidates.length >= 2) {
        startLocation = candidates[candidates.length - 2];
        endLocation = candidates[candidates.length - 1];
      }
    }

    // Extra boost using "to"
    if (cleanedText.toLowerCase().includes("to")) {
      const parts = cleanedText.split("to");
      if (parts.length >= 2) {
        startLocation = parts[0].split(" ").slice(-1)[0];
        endLocation = parts[1].split(" ")[0];
      }
    }

    // ===============================
    // CONFIDENCE SYSTEM (FIXED)
    // ===============================
    let confidenceScore = 0;

    if (ticketNumber && ticketNumber.length >= 5) confidenceScore += 40;
    if (date && /\d/.test(date)) confidenceScore += 30;
    if (startLocation && endLocation) confidenceScore += 30;

    const needsManualReview = confidenceScore < 70;

    // ===============================
    // RESPONSE
    // ===============================
    res.json({
      msg: "Processed ticket (Final Stable)",
      ticketNumber,
      date,
      startLocation,
      endLocation,
      confidenceScore,
      needsManualReview,
      cleanedText,
      rawText,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
