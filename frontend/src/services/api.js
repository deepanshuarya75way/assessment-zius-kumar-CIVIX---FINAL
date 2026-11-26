const API = import.meta.env.VITE_API_URL;

if (!API) {
  throw new Error("VITE_API_URL is missing. Check frontend/.env");
}

export default API.replace(/\/+$/, "");