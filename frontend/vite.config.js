import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// /api calls are forwarded to the Python back end (python app.py, port 8000).
//
//   npm run dev        the normal site on your computer:  http://localhost:5173
//   npm run dev:phone  the same site on https, so a PHONE on the same Wi-Fi is allowed to use the microphone.
//                      A phone only gives the microphone to https pages. Open the "Network" address Vite prints
//                      (https://192.168.x.x:5173). The first time the phone says "not private": tap Advanced, then Proceed.
export default defineConfig(async ({ mode }) => {
  const plugins = [react()];
  if (mode === "phone") {
    const ssl = await import("@vitejs/plugin-basic-ssl");     // installed by npm install
    plugins.push(ssl.default());
  }
  return {
    plugins,
    server: {
      host: true,                              // reachable from your phone on the same Wi-Fi
      allowedHosts: [".trycloudflare.com"],   // lets a Cloudflare quick tunnel (cloudflared tunnel --url http://localhost:5173) reach the dev server
      proxy: {
        "/api": { target: "http://127.0.0.1:8000", changeOrigin: true },
      },
    },
  };
});
