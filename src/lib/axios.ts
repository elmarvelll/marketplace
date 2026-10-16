// src/lib/axios.ts
//
// A shared axios instance for calling our own Next.js API routes
// (everything under /api/...) from client components.
//
// Using a pre-configured instance (instead of calling axios.get/post
// directly everywhere) means:
//   - every request automatically targets "/api" as its base, so callers
//     just write api.post("/register", data) instead of the full path.
//   - every request gets the same default headers (JSON) without repeating
//     them at every call site.
//   - if we ever need to add shared behavior (auth headers, error toasts,
//     retry logic, etc.) we do it once here and every caller benefits.

import axios from "axios";

const api = axios.create({
  baseURL: "/api",
  headers: {
    "Content-Type": "application/json",
  },
});

// A FormData body (image uploads — see ImageUploadField.tsx,
// ProductImagesField.tsx) needs the browser to set its own
// "multipart/form-data; boundary=..." header — the instance's default
// "application/json" above would otherwise win, since it was explicitly
// set rather than left for axios to infer, and the server's
// request.formData() call rejects anything that isn't actually
// multipart/form-data (or urlencoded).
api.interceptors.request.use((config) => {
  if (typeof FormData !== "undefined" && config.data instanceof FormData) {
    if (typeof config.headers?.delete === "function") {
      config.headers.delete("Content-Type");
    } else if (config.headers) {
      delete (config.headers as Record<string, unknown>)["Content-Type"];
    }
  }
  return config;
});

export default api;
