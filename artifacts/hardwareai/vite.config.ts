import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "path";

// PORT is used for local dev servers; BASE_PATH for the base URL the app is
// served under. Both default to sensible values so `vite build` works on
// vanilla CI (e.g. Vercel) without env provisioning.
const rawPort = process.env.PORT ?? "5173";
const port = Number(rawPort);
if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

const basePath = process.env.BASE_PATH ?? "/";
const isReplit = process.env.REPL_ID !== undefined;
const isDev = process.env.NODE_ENV !== "production";

// Replit-only dev plugins: HMR cartographer, their dev banner, and the
// runtime-error overlay. Gated so production and non-Replit dev both skip
// them entirely.
const replitPlugins = isDev && isReplit
  ? await Promise.all([
      import("@replit/vite-plugin-runtime-error-modal").then((m) => m.default()),
      import("@replit/vite-plugin-cartographer").then((m) =>
        m.cartographer({ root: path.resolve(import.meta.dirname, "..") }),
      ),
      import("@replit/vite-plugin-dev-banner").then((m) => m.devBanner()),
    ])
  : [];

export default defineConfig({
  base: basePath,
  plugins: [react(), tailwindcss(), ...replitPlugins],
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "src"),
      "@assets": path.resolve(import.meta.dirname, "..", "..", "attached_assets"),
    },
    dedupe: ["react", "react-dom"],
  },
  root: path.resolve(import.meta.dirname),
  build: {
    outDir: path.resolve(import.meta.dirname, "dist/public"),
    emptyOutDir: true,
    // Don't preload chunks for lazy routes — three.js is 1 MB and only needed
    // inside the Workspace, never on the landing page. Default preload is too
    // eager with our workspace-symlinked deps.
    modulePreload: { polyfill: true, resolveDependencies: () => [] },
    rollupOptions: {
      output: {
        manualChunks(id: string) {
          if (!id.includes("node_modules")) return;
          if (id.includes("three") || id.includes("@react-three/")) return "three";
          if (id.includes("@radix-ui/")) return "radix";
          if (id.includes("react-hook-form") || id.includes("@hookform/")) return "forms";
          if (id.includes("@tanstack/")) return "tanstack";
          if (id.includes("lucide-react")) return "icons";
          if (id.includes("recharts") || id.includes("d3-")) return "charts";
        },
      },
    },
  },
  server: {
    port,
    strictPort: true,
    host: "0.0.0.0",
    allowedHosts: true,
    fs: { strict: true },
  },
  preview: {
    port,
    host: "0.0.0.0",
    allowedHosts: true,
  },
});
