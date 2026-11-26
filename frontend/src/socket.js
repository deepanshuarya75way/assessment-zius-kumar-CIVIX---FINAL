import { io } from "socket.io-client";
import API from "./services/api";

const socket = io(API, {
  autoConnect: false,
  reconnection: true,
  reconnectionAttempts: Infinity,
  reconnectionDelay: 1000,
  reconnectionDelayMax: 5000,
  timeout: 10000,

  auth: (callback) => {
    callback({
      token: localStorage.getItem("token"),
    });
  },
});

socket.on("connect", () => {
  console.log("CIVIX Socket Connected:", socket.id);
});

socket.on("connect_error", (error) => {
  console.error("CIVIX Socket Connection Error:", error.message);
});

socket.on("disconnect", (reason) => {
  console.log("CIVIX Socket Disconnected:", reason);
});

export default socket;
