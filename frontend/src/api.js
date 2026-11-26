import axios from "axios";
import BASE_URL from "./services/api";

const API = axios.create({
  baseURL: `${BASE_URL}/api`,
});

API.interceptors.request.use((config) => {
  const token = localStorage.getItem("token");

  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }

  return config;
});

export default API;
