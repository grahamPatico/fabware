// Vercel Function wrapping the Fabware Express app. Any request to /api/*
// hits this handler, which hands it to the Express router defined in
// artifacts/api-server/src/app.ts. The Express app mounts its router at
// /api, so we pass the original URL through unchanged.

import type { IncomingMessage, ServerResponse } from "node:http";
import app from "../artifacts/api-server/src/app";

// The AI designer agent loop can take 15–25s to finish; give it room.
export const config = {
  maxDuration: 60,
};

export default function handler(req: IncomingMessage, res: ServerResponse) {
  return app(req, res);
}
