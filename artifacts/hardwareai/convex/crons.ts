import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

// SendCutSend publishes its catalog + engineering specs as static CDN JSON.
// Daily is plenty — SCS regenerates the feeds on the order of weeks, and a
// failed run leaves the previous cache row in place.
crons.daily(
  "refresh SendCutSend rules",
  { hourUTC: 9, minuteUTC: 20 },
  internal.scsSync.refresh,
);

export default crons;
