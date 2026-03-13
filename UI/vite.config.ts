
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";

export default defineConfig({
  plugins: [react()],
  build: {
    target: "esnext",
    outDir: "build",
  },
  server: {
    port: 3000,
    open: true,
    proxy: {
      "/api": {
        target: "http://localhost:3005",
        changeOrigin: true,
      },
      "/health": {
        target: "http://localhost:3005",
        changeOrigin: true,
      },
    },
  },
});
