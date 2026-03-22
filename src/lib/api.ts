import axios from "axios";

// Auto-detect local network testing (e.g. 192.168.x.x or localhost)
const isLocalNetwork = window.location.hostname === 'localhost' || /^(192\.168|10\.|172\.(1[6-9]|2[0-9]|3[0-1]))\./.test(window.location.hostname);
const defaultApiUrl = isLocalNetwork ? (import.meta.env.VITE_API_URL || `http://${window.location.hostname}:5002`) : 'https://blink-backend-0e54.onrender.com';

const API_URL = import.meta.env.VITE_API_URL || defaultApiUrl;


export const api = axios.create({
    baseURL: API_URL,
    headers: {
        "Content-Type": "application/json"
    }
});

// Interceptor for Auth Token
api.interceptors.request.use((config) => {
    const token = localStorage.getItem("token");
    if (token) {
        config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
});

export default api;
