
const mongoose = require("mongoose");

const userSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },

    email: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      lowercase: true,
    },

    password: {
      type: String,
      required: true,
    },

    location: {
      type: String,
      trim: true,
    },

    role: {
      type: String,
      enum: ["citizen", "official", "admin"],
      default: "citizen",
    },

    governmentId: {
      type: String,
      default: null,
    },

    resetOTP: {
      type: String,
    },

    resetOTPExpire: {
      type: Date,
    },

    profilePhoto: {
      type: String,
      default: "",
    },

    notifications: {
      type: Boolean,
      default: true,
    },

    isBanned: {
      type: Boolean,
      default: false,
    },

    isVerified: {
      type: Boolean,
      default: false,
    },
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model("User", userSchema);
