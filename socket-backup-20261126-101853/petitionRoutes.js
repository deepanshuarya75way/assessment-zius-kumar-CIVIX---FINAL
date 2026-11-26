const express = require("express");
const router = express.Router();

const Petition = require("../models/Petition");
const User = require("../models/User");
const auth = require("../middleware/authMiddleware");
const sendEmail = require("../utils/sendEmail");
const Notification = require("../models/Notification");

// Emit a live update to connected clients
const emitPetitionUpdate = (req, petition) => {
  const io = req.app.get("io");

  if (io) {
    io.emit("petition:updated", {
      petitionId: petition._id,
      signatures: petition.signatures?.length || 0,
      status: petition.status,
    });
  }
};

// Create a notification and send it to the recipient
const createAndEmitNotification = async (req, userId, message) => {
  const notification = await Notification.create({
    userId,
    message,
  });

  const io = req.app.get("io");

  if (io) {
    io.to(`user:${userId.toString()}`).emit("notification:new", notification);
  }

  return notification;
};

/* ================= CREATE ================= */

router.post("/", auth, async (req, res) => {
  try {
    const { title, description, category, location, goal } = req.body;

    const petition = new Petition({
      title,
      description,
      category,
      location,
      goal: goal || 100,
      createdBy: req.user.id,
    });

    await petition.save();

    emitPetitionUpdate(req, petition);

    res.status(201).json(petition);
  } catch (error) {
    console.error("Create petition error:", error);
    res.status(500).json({ message: "Error creating petition" });
  }
});

/* ================= GET ALL ================= */

router.get("/", auth, async (req, res) => {
  try {
    const { page = 1, limit = 5, category, location } = req.query;

    const query = {};
    const user = await User.findById(req.user.id);

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    if (user.role === "official" && user.location) {
      query.location = { $regex: user.location, $options: "i" };
    }

    if (category) {
      query.category = { $regex: category, $options: "i" };
    }

    if (location) {
      query.location = { $regex: location, $options: "i" };
    }

    const total = await Petition.countDocuments(query);

    const petitions = await Petition.find(query)
      .populate("createdBy", "name email location role")
      .populate("responses.officialId", "name")
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(Number(limit));

    res.json({
      petitions,
      totalPages: Math.ceil(total / limit),
    });
  } catch (error) {
    console.error("Fetch petitions error:", error);
    res.status(500).json({ message: "Error fetching petitions" });
  }
});

/* ================= GET ONE ================= */

router.get("/:id", auth, async (req, res) => {
  try {
    const petition = await Petition.findById(req.params.id)
      .populate("createdBy", "name email location role")
      .populate("responses.officialId", "name");

    if (!petition) {
      return res.status(404).json({ message: "Petition not found" });
    }

    res.json(petition);
  } catch (error) {
    console.error("Fetch petition error:", error);
    res.status(500).json({ message: "Error fetching petition" });
  }
});

/* ================= SIGN ================= */

router.put("/sign/:id", auth, async (req, res) => {
  try {
    const petition = await Petition.findById(req.params.id);

    if (!petition) {
      return res.status(404).json({ message: "Petition not found" });
    }

    if (petition.status !== "active") {
      return res.status(400).json({
        message: "Petition must be approved by an admin before it can be signed.",
      });
    }

    const alreadySigned = petition.signatures.some(
      (id) => id.toString() === req.user.id
    );

    if (alreadySigned) {
      return res.status(400).json({
        message: "You have already signed this petition.",
      });
    }

    petition.signatures.push(req.user.id);

    if (petition.signatures.length >= petition.goal) {
      petition.status = "under_review";
    }

    await petition.save();

    await createAndEmitNotification(
      req,
      petition.createdBy,
      "Someone signed your petition: " + petition.title
    );

    emitPetitionUpdate(req, petition);

    res.json({
      message: "Signed successfully",
      petition,
    });
  } catch (error) {
    console.error("Sign petition error:", error);
    res.status(500).json({ message: "Error signing petition" });
  }
});

/* ================= OFFICIAL RESPONSE ================= */

router.post("/respond/:id", auth, async (req, res) => {
  try {
    const { comment } = req.body;

    const user = await User.findById(req.user.id);

    if (!user || user.role !== "official") {
      return res.status(403).json({
        message: "Only officials can respond",
      });
    }

    const petition = await Petition.findById(req.params.id)
      .populate("createdBy");

    if (!petition) {
      return res.status(404).json({ message: "Petition not found" });
    }

    petition.responses.push({
      officialId: req.user.id,
      comment,
    });

    await petition.save();

    const creatorId = petition.createdBy._id;

    await createAndEmitNotification(
      req,
      creatorId,
      "Official responded to your petition: " + petition.title
    );

    emitPetitionUpdate(req, petition);

    const petitionOwner = await User.findById(creatorId);

    if (petitionOwner?.notifications) {
      await sendEmail(
        petitionOwner.email,
        "Official Response to Your Petition",
        `Hello ${petitionOwner.name},

An official responded to your petition "${petition.title}".

Response:
${comment}

Thank you.`
      );
    }

    res.json({ message: "Response added" });
  } catch (error) {
    console.error("Respond to petition error:", error);
    res.status(500).json({ message: "Error responding" });
  }
});

/* ================= CLOSE ================= */

router.put("/close/:id", auth, async (req, res) => {
  try {
    const petition = await Petition.findById(req.params.id);
    const user = await User.findById(req.user.id);

    if (!petition) {
      return res.status(404).json({ message: "Petition not found" });
    }

    if (!user || (user.role !== "official" && user.role !== "admin")) {
      return res.status(403).json({
        message: "Not authorized to close petitions",
      });
    }

    petition.status = "closed";
    await petition.save();

    const creatorId = petition.createdBy?._id || petition.createdBy;

    await createAndEmitNotification(
      req,
      creatorId,
      "Your petition has been closed: " + petition.title
    );

    emitPetitionUpdate(req, petition);

    const owner = await User.findById(creatorId);

    if (owner?.notifications) {
      await sendEmail(
        owner.email,
        "Petition Closed",
        `Hello,

Your petition "${petition.title}" has been closed.

Thank you.`
      );
    }

    res.json({
      message: "Petition closed successfully",
      petition,
    });
  } catch (error) {
    console.error("Close petition error:", error);
    res.status(500).json({ message: "Error closing petition" });
  }
});

/* ================= APPROVE ================= */

router.put("/approve/:id", auth, async (req, res) => {
  try {
    const petition = await Petition.findById(req.params.id);
    const user = await User.findById(req.user.id);

    if (!petition) {
      return res.status(404).json({ message: "Petition not found" });
    }

    if (!user || (user.role !== "official" && user.role !== "admin")) {
      return res.status(403).json({ message: "Not authorized" });
    }

    petition.status = "active";
    await petition.save();

    const creatorId = petition.createdBy?._id || petition.createdBy;

    await createAndEmitNotification(
      req,
      creatorId,
      "Your petition has been approved: " + petition.title
    );

    emitPetitionUpdate(req, petition);

    res.json({
      message: "Petition approved successfully",
      petition,
    });
  } catch (error) {
    console.error("Approve petition error:", error);
    res.status(500).json({ message: "Error approving petition" });
  }
});

/* ================= UPDATE ================= */

router.put("/:id", auth, async (req, res) => {
  try {
    const petition = await Petition.findById(req.params.id);

    if (!petition) {
      return res.status(404).json({ message: "Petition not found" });
    }

    if (petition.createdBy.toString() !== req.user.id) {
      return res.status(403).json({ message: "Not authorized" });
    }

    if (petition.status !== "active") {
      return res.status(400).json({
        message: "Only active petitions can be edited",
      });
    }

    const { title, description, category, location, goal } = req.body;

    petition.title = title;
    petition.description = description;
    petition.category = category;
    petition.location = location;
    petition.goal = goal;

    await petition.save();

    emitPetitionUpdate(req, petition);

    res.json({
      message: "Petition updated successfully",
      petition,
    });
  } catch (error) {
    console.error("Update petition error:", error);
    res.status(500).json({ message: "Error updating petition" });
  }
});

/* ================= DELETE ================= */

router.delete("/:id", auth, async (req, res) => {
  try {
    const petition = await Petition.findById(req.params.id);
    const user = await User.findById(req.user.id);

    if (!petition) {
      return res.status(404).json({ message: "Petition not found" });
    }

    const isOfficial = user?.role === "official";
    const isCreator = petition.createdBy.toString() === req.user.id;

    if (!isOfficial && !isCreator) {
      return res.status(403).json({ message: "Not authorized" });
    }

    const petitionId = petition._id;

    await petition.deleteOne();

    const io = req.app.get("io");

    if (io) {
      io.emit("petition:deleted", { petitionId });
    }

    res.json({
      message: isOfficial ? "Deleted by official" : "Deleted by creator",
    });
  } catch (error) {
    console.error("Delete petition error:", error);
    res.status(500).json({ message: "Error deleting petition" });
  }
});

module.exports = router;
