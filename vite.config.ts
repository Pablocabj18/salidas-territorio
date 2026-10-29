import { defineConfig } from "vite";

export default defineConfig({
  build: {
    // MapLibre cambia poco: en su propio archivo queda en caché entre publicaciones de la app.
    chunkSizeWarningLimit: 1100,
    rollupOptions: {
      output: {
        manualChunks: (id) => (id.includes("node_modules/maplibre-gl") ? "maplibre" : undefined),
      },
    },
  },
});
