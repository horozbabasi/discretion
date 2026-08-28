import { defineConfig } from 'vite';
import { createReadStream, statSync } from 'node:fs';
import { join, normalize } from 'node:path';

const MODELS = 'C:/Users/Pc/dev/privacyshield/.hf-cache';

// Serve the already-downloaded model cache at /hfmodels/ so the browser build
// fetches exactly the bytes the Node benchmark used — same model, same dtype,
// same revision. Copying 300 MB into public/ would prove nothing extra.
function modelServer() {
  return {
    name: 'model-server',
    configureServer(server) {
      server.middlewares.use('/hfmodels', (req, res, next) => {
        const rel = decodeURIComponent((req.url ?? '').split('?')[0] ?? '');
        const file = normalize(join(MODELS, rel));
        if (!file.startsWith(normalize(MODELS))) { res.statusCode = 403; return res.end(); }
        try {
          const s = statSync(file);
          if (!s.isFile()) return next();
          res.setHeader('Content-Length', String(s.size));
          res.setHeader('Content-Type', file.endsWith('.json') ? 'application/json' : 'application/octet-stream');
          createReadStream(file).pipe(res);
        } catch { next(); }
      });
    },
  };
}

export default defineConfig({
  plugins: [modelServer()],
  server: {
    port: 5211,
    headers: {
      // WASM multi-threading needs cross-origin isolation; without these
      // onnxruntime-web silently falls back to single-threaded, which would
      // understate the shipped configuration.
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cross-Origin-Embedder-Policy': 'require-corp',
    },
  },
  optimizeDeps: { exclude: ['@huggingface/transformers'] },
});
