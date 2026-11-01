import react from "@vitejs/plugin-react";
import { defineConfig, loadEnv } from "vite";

// The dashboard talks to the tracky server through this proxy, which adds the API key,
// so the token never reaches the browser. TRACKY_API and ALLOW_TOKEN come from the env or web/.env.
export default defineConfig(({ mode }) => {
  const env = { ...loadEnv(mode, process.cwd(), ""), ...process.env };
  return {
    plugins: [react()],
    server: {
      proxy: {
        "/api": {
          target: env.TRACKY_API ?? "http://localhost:8000",
          changeOrigin: true,
          headers: { "x-api-key": env.ALLOW_TOKEN ?? "" },
        },
      },
    },
  };
});
