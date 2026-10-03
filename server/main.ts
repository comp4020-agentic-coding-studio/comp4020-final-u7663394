// Boot: open (and migrate) the database on the volume, then serve. Migrations
// run here rather than in a Fly release_command, because only this machine
// has the volume.
import { serve } from "@hono/node-server";
import { openDatabase } from "./db.ts";
import { createApp } from "./app.ts";

const port = Number(process.env.PORT ?? 8080);
const dataDir = process.env.DATA_DIR ?? "data";

const db = openDatabase(dataDir);
const app = createApp(db, process.env.CLIENT_DIR ?? "dist");

serve({ fetch: app.fetch, port, hostname: "0.0.0.0" }, (info) => {
  console.log(`listening on http://0.0.0.0:${info.port} (data in ${dataDir})`);
});

// Fly stops an idle machine with SIGINT; close the database cleanly so the
// WAL is checkpointed into the main file.
for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => {
    console.log(`${signal}: closing`);
    db.close();
    process.exit(0);
  });
}
