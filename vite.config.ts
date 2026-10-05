import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import type { IncomingMessage, ServerResponse } from 'http';
import fs from 'fs';
import path from 'path';

// Helper to parse JSON body from incoming HTTP request
function parseBody(req: IncomingMessage): Promise<any> {
  return new Promise((resolve) => {
    let data = '';
    req.on('data', (chunk) => {
      data += chunk;
    });
    req.on('end', () => {
      if (!data.trim()) {
        resolve({});
        return;
      }
      try {
        resolve(JSON.parse(data));
      } catch (err) {
        resolve({ __invalid_json: true, raw: data });
      }
    });
  });
}

// In-memory model engine for the server middleware
const KNOWN_GENRES = [
  "Action", "Thriller", "Comedy", "Shorts", "Drama",
  "Sci-Fi", "Family", "Animation", "Documentary", "Horror", "Romance", "Crime"
];

const CLUSTER_PROFILES: Record<number, any> = {
  1: {
    id: 1,
    name: "High-Engagement Action Viewers",
    recommendations: ["The Dark Knight", "Inception", "Heat", "Mad Max: Fury Road", "Extraction 2"],
    centroid: { watch: 1.45, session: 1.35, action: 0.92, comedy: 0.15, diversity: 0.35, family: 0.10 }
  },
  0: {
    id: 0,
    name: "Casual Short-Session Viewers",
    recommendations: ["Brooklyn Nine-Nine", "Parks and Recreation", "Dave Chappelle: The Closer", "Short Take Daily", "Modern Family"],
    centroid: { watch: -0.45, session: -1.25, action: 0.15, comedy: 0.88, diversity: 0.30, family: 0.20 }
  },
  2: {
    id: 2,
    name: "Genre-Explorers",
    recommendations: ["Everything Everywhere All at Once", "Parasite", "Planet Earth III", "Severance", "Past Lives"],
    centroid: { watch: 0.55, session: 0.40, action: 0.45, comedy: 0.50, diversity: 0.94, family: 0.35 }
  },
  3: {
    id: 3,
    name: "Low-Activity Weekend Viewers",
    recommendations: ["Spider-Man: Across the Spider-Verse", "Paddington 2", "Encanto", "Top Gun: Maverick", "Super Mario Bros. Movie"],
    centroid: { watch: -1.25, session: -0.55, action: 0.20, comedy: 0.30, diversity: 0.25, family: 0.85 }
  }
};

let serverModelLoaded = true;

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    {
      name: 'api-server-middleware',
      configureServer(server) {
        server.middlewares.use(async (req, res, next) => {
          const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
          const pathname = url.pathname;

          // GET /health
          if (req.method === 'GET' && (pathname === '/health' || pathname === '/api/health')) {
            res.setHeader('Content-Type', 'application/json');
            res.statusCode = 200;
            res.end(JSON.stringify({
              status: serverModelLoaded ? "ok" : "degraded",
              model_loaded: serverModelLoaded,
              version: "1.0.0",
              n_clusters: 4
            }));
            return;
          }

          // POST /recommend
          if (req.method === 'POST' && pathname === '/recommend') {
            res.setHeader('Content-Type', 'application/json');

            if (url.searchParams.get('simulate_unloaded') === 'true' || !serverModelLoaded) {
              res.statusCode = 503;
              res.end(JSON.stringify({
                error: "Service Unavailable",
                message: "Model artifact not loaded in memory yet"
              }));
              return;
            }

            const body = await parseBody(req);
            if (body.__invalid_json) {
              res.statusCode = 422;
              res.end(JSON.stringify({
                error: "Validation Error",
                detail: [{ loc: ["body"], msg: "Invalid JSON payload", type: "value_error.json" }]
              }));
              return;
            }

            // Pydantic validation simulation
            const errors: any[] = [];
            if (!body.user_id && body.user_id !== 0) {
              errors.push({ loc: ["body", "user_id"], msg: "field required", type: "value_error.missing" });
            } else if (typeof body.user_id !== 'string') {
              errors.push({ loc: ["body", "user_id"], msg: "user_id must be a string", type: "type_error.string" });
            }

            if (body.watch_time_hours === undefined || body.watch_time_hours === null) {
              errors.push({ loc: ["body", "watch_time_hours"], msg: "field required", type: "value_error.missing" });
            } else if (typeof body.watch_time_hours !== 'number' || isNaN(body.watch_time_hours)) {
              errors.push({ loc: ["body", "watch_time_hours"], msg: "value is not a valid float", type: "type_error.float" });
            } else if (body.watch_time_hours < 0) {
              errors.push({ loc: ["body", "watch_time_hours"], msg: "ensure this value is greater than or equal to 0", type: "value_error.number.not_ge" });
            }

            if (body.avg_session_mins === undefined || body.avg_session_mins === null) {
              errors.push({ loc: ["body", "avg_session_mins"], msg: "field required", type: "value_error.missing" });
            } else if (typeof body.avg_session_mins !== 'number' || isNaN(body.avg_session_mins)) {
              errors.push({ loc: ["body", "avg_session_mins"], msg: "value is not a valid float", type: "type_error.float" });
            } else if (body.avg_session_mins < 0) {
              errors.push({ loc: ["body", "avg_session_mins"], msg: "ensure this value is greater than or equal to 0", type: "value_error.number.not_ge" });
            }

            if (body.top_genres === undefined || body.top_genres === null) {
              errors.push({ loc: ["body", "top_genres"], msg: "field required", type: "value_error.missing" });
            } else if (!Array.isArray(body.top_genres)) {
              errors.push({ loc: ["body", "top_genres"], msg: "value is not a valid list", type: "type_error.list" });
            }

            if (errors.length > 0) {
              res.statusCode = 422;
              res.end(JSON.stringify({ error: "Validation Error", detail: errors }));
              return;
            }

            // Outlier clipping
            const watch = Math.min(body.watch_time_hours, 120.0);
            const session = Math.min(body.avg_session_mins, 240.0);
            const watchNorm = (watch - 18.5) / 12.0;
            const sessionNorm = (session - 45.0) / 28.0;

            const lower = body.top_genres.map((g: any) => String(g).toLowerCase().trim());
            const hasAction = lower.some((g: string) => g.includes("action") || g.includes("thriller"));
            const hasComedy = lower.some((g: string) => g.includes("comedy") || g.includes("short"));
            const hasFamily = lower.some((g: string) => g.includes("family") || g.includes("animation"));
            const knownCount = body.top_genres.filter((g: any) => KNOWN_GENRES.some(k => k.toLowerCase() === String(g).toLowerCase())).length;
            const divAffinity = knownCount >= 3 ? 0.9 : knownCount >= 2 ? 0.6 : (knownCount === 1 ? 0.25 : 0.1);

            let bestClusterId = 0;
            let minDistance = Infinity;

            for (const [idStr, profile] of Object.entries(CLUSTER_PROFILES)) {
              const c = profile.centroid;
              const dist = Math.sqrt(
                Math.pow(watchNorm - c.watch, 2) * 1.5 +
                Math.pow(sessionNorm - c.session, 2) * 1.5 +
                Math.pow((hasAction ? 0.95 : 0.05) - c.action, 2) * 1.0 +
                Math.pow((hasComedy ? 0.95 : 0.05) - c.comedy, 2) * 1.0 +
                Math.pow(divAffinity - c.diversity, 2) * 1.2 +
                Math.pow((hasFamily ? 0.95 : 0.05) - c.family, 2) * 1.0
              );
              if (dist < minDistance) {
                minDistance = dist;
                bestClusterId = Number(idStr);
              }
            }

            const assigned = CLUSTER_PROFILES[bestClusterId];
            res.statusCode = 200;
            res.end(JSON.stringify({
              user_id: body.user_id,
              segment_id: assigned.id,
              segment_name: assigned.name,
              recommendations: assigned.recommendations,
              distance_to_centroid: Math.round(minDistance * 100) / 100
            }));
            return;
          }

          // GET /api/spec-content
          if (req.method === 'GET' && pathname === '/api/spec-content') {
            try {
              const specPath = path.resolve(process.cwd(), 'xxyy.html');
              if (fs.existsSync(specPath)) {
                const content = fs.readFileSync(specPath, 'utf-8');
                res.setHeader('Content-Type', 'text/html');
                res.statusCode = 200;
                res.end(content);
                return;
              }
            } catch {
              // fallback
            }
          }

          next();
        });
      }
    }
  ],
  server: {
    port: 3000,
    host: '0.0.0.0',
    strictPort: true
  }
});
