import { io } from "socket.io-client";
import API from "./services/api";

const socket = io(API, {
  autoConnect: false,
  reconnection: true,
  reconnectionAttempts: Infinity,
  reconnectionDelay: 1000,
  reconnectionDelayMax: 5000,
  auth: (callback) => {
    callback({
      token: localStorage.getItem("token"),
    });
  },
});

export default socket;
