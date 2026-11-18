import { defineConfig } from "vite";
export default defineConfig({
  server: {
    port: 5173,
    strictPort: true,
    allowedHosts: ["shopper-reheat-earshot.ngrok-free.dev"],
  },
  build: { target: "es2022", sourcemap: false, outDir: "dist", emptyOutDir: true },
});
