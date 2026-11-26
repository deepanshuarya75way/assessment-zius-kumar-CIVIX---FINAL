from pathlib import Path
import re
import shutil
from datetime import datetime

ROOT = Path.cwd()
BACKUP = ROOT / ("socket-backup-" + datetime.now().strftime("%Y%m%d-%H%M%S"))

def backup(path):
    BACKUP.mkdir(exist_ok=True)
    destination = BACKUP / path.name
    shutil.copy2(path, destination)
    print(f"Backup: {destination}")

def read_file(name):
    path = ROOT / name
    if not path.exists():
        raise FileNotFoundError(f"Missing file: {name}")
    return path, path.read_text()

def save(path, content):
    path.write_text(content)
    print(f"UPDATED: {path.relative_to(ROOT)}")

# --------------------------------------------------
# 1. BACKEND SERVER: Authenticate and join admin room
# --------------------------------------------------

path, code = read_file("backend/server.js")

if 'const User = require("./models/User");' not in code:
    code = code.replace(
        'require("dotenv").config();',
        'require("dotenv").config();\nconst User = require("./models/User");'
    )

server_block = r'''
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
'''

pattern = r'// Authenticate socket connections.*?app\.set\("io", io\);'

if re.search(pattern, code, re.S):
    backup(path)
    code = re.sub(pattern, server_block.strip(), code, count=1, flags=re.S)
    save(path, code)
else:
    print("SKIPPED server.js: expected socket authentication block not found")

# --------------------------------------------------
# 2. PETITION ROUTE: Emit new petition and notifications
# --------------------------------------------------

path, code = read_file("backend/routes/petitionRoutes.js")

petition_handler = r'''
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

    const io = req.app.get("io");

    // Notify connected admin dashboards immediately.
    if (io) {
      io.to("admins").emit("petition:created", {
        petition,
      });
    }

    // Save persistent notifications for admins.
    try {
      const admins = await User.find({
        role: "admin",
      }).select("_id");

      const notifications = await Notification.insertMany(
        admins.map((admin) => ({
          userId: admin._id,
          message: `New petition created: ${petition.title}`,
        }))
      );

      // Send notification to each admin's personal room.
      if (io) {
        notifications.forEach((notification) => {
          io.to(`user:${notification.userId.toString()}`)
            .emit("notification:new", notification);
        });
      }
    } catch (notificationError) {
      console.error("Admin notification error:", notificationError);
    }

    emitPetitionUpdate(req, petition);

    return res.status(201).json(petition);

  } catch (error) {
    console.error("Create petition error:", error);

    return res.status(500).json({
      message: "Error creating petition",
    });
  }
});
'''

pattern = r'router\.post\("/",\s*auth,\s*async\s*\(req,\s*res\)\s*=>\s*\{.*?\n\}\);'

if re.search(pattern, code, re.S):
    backup(path)
    code = re.sub(pattern, petition_handler.strip(), code, count=1, flags=re.S)
    save(path, code)
else:
    print("SKIPPED petitionRoutes.js: create route not found")

# --------------------------------------------------
# 3. ADMIN ROUTES: Emit saved notifications in realtime
# --------------------------------------------------

path, code = read_file("backend/routes/adminRoutes.js")

helper = '''
// Save and emit a notification to the intended user.
const createAndEmitNotification = async (req, userId, message) => {
  const notification = await Notification.create({
    userId,
    message,
  });

  const io = req.app.get("io");

  if (io) {
    io.to(`user:${userId.toString()}`).emit(
      "notification:new",
      notification
    );
  }

  return notification;
};
'''

if "const createAndEmitNotification = async" not in code:
    anchor = 'const sendEmail = require("../utils/sendEmail");'
    if anchor not in code:
        print("SKIPPED adminRoutes helper: import anchor not found")
    else:
        backup(path)
        code = code.replace(anchor, anchor + "\n" + helper, 1)

# Replace approval notification
code, count1 = re.subn(
    r'await Notification\.create\(\{\s*userId:\s*petition\.createdBy\._id,\s*message:\s*`Your petition "\$\{petition\.title\}" has been approved by admin\.`,?\s*\}\);',
    '''await createAndEmitNotification(
      req,
      petition.createdBy._id,
      `Your petition "${petition.title}" has been approved by admin.`
    );''',
    code
)

# Replace rejection notification
code, count2 = re.subn(
    r'await Notification\.create\(\{\s*userId:\s*petition\.createdBy\._id,\s*message:\s*`Your petition "\$\{petition\.title\}" was rejected\. Reason: \$\{reason \|\| "N/A"\}`,?\s*\}\);',
    '''await createAndEmitNotification(
      req,
      petition.createdBy._id,
      `Your petition "${petition.title}" was rejected. Reason: ${reason || "N/A"}`
    );''',
    code
)

# Replace status notification
code, count3 = re.subn(
    r'await Notification\.create\(\{\s*userId:\s*petition\.createdBy\._id,\s*message:\s*`Your petition status changed to: \$\{status\.replace\("_", " "\)\}`,?\s*\}\);',
    '''await createAndEmitNotification(
      req,
      petition.createdBy._id,
      `Your petition status changed to: ${status.replace("_", " ")}`
    );''',
    code
)

if count1 + count2 + count3:
    if not (BACKUP / path.name).exists():
        backup(path)
    save(path, code)

print(
    "Admin notification handlers updated:",
    count1 + count2 + count3,
    "of 3"
)

# --------------------------------------------------
# 4. FRONTEND SOCKET URL
# --------------------------------------------------

path = ROOT / "frontend/src/socket.js"

if path.exists():
    code = path.read_text()

    if "io(API," in code:
        backup(path)

        code = code.replace(
            'const socket = io(API, {',
            '''const API_BASE_URL =
  API.defaults?.baseURL || import.meta.env.VITE_API_URL;

const SOCKET_URL = API_BASE_URL
  ? new URL(API_BASE_URL, window.location.origin).origin
  : window.location.origin;

const socket = io(SOCKET_URL, {'''
        )

        code += '''
socket.on("connect", () => {
  console.log("CIVIX Socket connected:", socket.id);
});

socket.on("connect_error", (error) => {
  console.error("CIVIX Socket error:", error.message);
});
'''
        save(path, code)
    else:
        print("Socket URL not changed: expected io(API, ...) not found")
else:
    print("SKIPPED: frontend/src/socket.js not found")

print("\\nPATCH COMPLETE")
print("Backups:", BACKUP if BACKUP.exists() else "No files changed")
print("\\nIMPORTANT: Frontend listeners and socket.connect()")
print("must also be integrated into the authenticated dashboard.")
