import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

// Checks up to eight rate documents a day, each about once a month.
crons.daily("check port rate documents", { hourUTC: 3, minuteUTC: 15 }, internal.sourceWatch.checkDue, {});

export default crons;
