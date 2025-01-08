import { defineConfig } from 'vite';

export default defineConfig({
    server: {
        open: true, // Opens the browser automatically
    },
    build: {
        outDir: 'dist', // Output directory
    },
});
