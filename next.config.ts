import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Erlaubt den Zugriff über einen Cloudflare Quick Tunnel im Dev-Modus —
  // ohne das blockt Next.js die HMR-Websocket-Verbindung als cross-origin,
  // was zu einer Reload-Schleife führt (Formulare verlieren dabei ihren State).
  allowedDevOrigins: ["*.trycloudflare.com"],
  // Gesichtserkennung und Remotion laden WebAssembly, Modellgewichte, webpack
  // und Plattform-Binaries relativ zum eigenen Paketverzeichnis. Gebündelt
  // stimmen diese Pfade nicht mehr — deshalb zur Laufzeit per `require` aus
  // node_modules.
  serverExternalPackages: [
    "@vladmandic/face-api",
    "@tensorflow/tfjs",
    "@tensorflow/tfjs-backend-wasm",
    "@remotion/bundler",
    "@remotion/renderer",
    "@trigger.dev/sdk",
  ],
  // Die lokale Ablage (Downloads, Renders) landete sonst im Trace jeder
  // API-Route — mehrere GB pro Funktion, Vercel erlaubt 250 MB. In der Cloud
  // liegen die Dateien in R2.
  outputFileTracingExcludes: {
    "/*": [".omegaclip-data/**/*"],
  },
};

export default nextConfig;
