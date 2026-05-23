import cron from "node-cron";
import { exec } from "child_process";
import { promisify } from "util";

const execAsync = promisify(exec);

// ─── PIPELINE ────────────────────────────────────────────────────────────────

async function runPipeline() {
  const started = new Date().toISOString();
  console.log(`\n⏰ [${started}] Scheduler: starting fetch → ingest pipeline`);

  const steps = [
    { name: "fetch:tm",   cmd: "node src/fetchers/ticketmaster.js" },
    { name: "fetch:sg",   cmd: "node src/fetchers/seatgeek.js" },
    { name: "fetch:jazz", cmd: "node src/fetchers/jazz-nyc.js" },
    { name: "ingest",     cmd: "node db/ingest.js" },
  ];

  for (const step of steps) {
    try {
      console.log(`  ▶ ${step.name}...`);
      const { stdout, stderr } = await execAsync(step.cmd, { cwd: process.cwd() });
      // Pull the key summary line from each script's output
      const summary = (stdout + stderr)
        .split("\n")
        .filter((l) => l.match(/✅|💾|Ingested|Got \d+/))
        .slice(0, 2)
        .join(" | ");
      console.log(`  ✅ ${step.name}: ${summary || "done"}`);
    } catch (err) {
      console.error(`  ❌ ${step.name} failed: ${err.message.split("\n")[0]}`);
      // Continue to next step even if one fails
    }
  }

  console.log(`  🏁 Pipeline complete [${new Date().toISOString()}]\n`);
}

// ─── SCHEDULE ─────────────────────────────────────────────────────────────────
// Runs at 10am, 2pm, 5pm, 8pm NYC time (America/New_York)

const TIMES = [
  { label: "10:00am", cron: "0 10 * * *" },
  { label: "2:00pm",  cron: "0 14 * * *" },
  { label: "5:00pm",  cron: "0 17 * * *" },
  { label: "8:00pm",  cron: "0 20 * * *" },
];

export function startScheduler() {
  console.log("📅 Scheduler active — pipeline runs at:", TIMES.map((t) => t.label).join(", "));

  TIMES.forEach(({ cron: expression }) => {
    cron.schedule(expression, runPipeline, { timezone: "America/New_York" });
  });
}

export { runPipeline };
