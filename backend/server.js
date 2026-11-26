const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const http = require("http");
const jwt = require("jsonwebtoken");
const { Server } = require("socket.io");
require("dotenv").config();
const User = require("./models/User");

const app = express();
const server = http.createServer(app);

const allowedOrigins = [
  "http://localhost:5173",
  "https://civix-frontend.onrender.com",
  /\.onrender\.com$/,
  /\.netlify\.app$/,
];

app.use(cors({
  origin: allowedOrigins,
  credentials: true,
}));

app.use(express.json());

app.get("/", (req, res) => {
  res.send("CIVIX Backend is Running 🚀");
});

// MongoDB connection
mongoose
  .connect(process.env.MONGO_URI)
  .then(() => console.log("MongoDB Connected"))
  .catch((err) => console.error("MongoDB error:", err));

// Socket.IO with reconnection recovery
const io = new Server(server, {
  cors: {
    origin: allowedOrigins,
    methods: ["GET", "POST", "PUT", "DELETE"],
    credentials: true,
  },
  connectionStateRecovery: {
    maxDisconnectionDuration: 2 * 60 * 1000,
    skipMiddlewares: false,
  },
});

// Authenticate socket connections and join role-based rooms.
io.use(async (socket, next) => {
  try {
    const token = socket.handshake.auth?.token;

    if (!token) {
      return next(new Error("Authentication required"));
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    if (!decoded.id) {
      return next(new Error("Invalid token payload"));
    }

    const user = await User.findById(decoded.id).select("role");

    if (!user) {
      return next(new Error("User not found"));
    }

    socket.userId = user._id.toString();
    socket.userRole = user.role;

    next();
  } catch (error) {
    next(new Error("Invalid or expired token"));
  }
});

io.on("connection", (socket) => {
  socket.join(`user:${socket.userId}`);

  if (socket.userRole === "admin") {
    socket.join("admins");
    console.log("Admin joined:", socket.userId);
  }

  console.log("Socket connected:", socket.userId);

  socket.on("disconnect", (reason) => {
    console.log("Socket disconnected:", socket.userId, reason);
  });
});

app.set("io", io);

// Routes
app.use("/api/auth", require("./routes/authRoutes"));
app.use("/api/dashboard", require("./routes/dashboard"));
app.use("/api/petitions", require("./routes/petitionRoutes"));
app.use("/api/polls", require("./routes/polls"));
app.use("/api/reports", require("./routes/reports"));
app.use("/api/officials", require("./routes/officialRoutes"));
app.use("/uploads", express.static("uploads"));
app.use("/api/settings", require("./routes/settingsRoutes"));
app.use("/api/notifications", require("./routes/notificationRoutes"));
app.use("/api/admin", require("./routes/adminRoutes"));

const PORT = process.env.PORT || 5000;

server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
