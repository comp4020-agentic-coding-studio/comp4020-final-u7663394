// A copy of the server of the spec's own, for the checks that need to see
// what the running app can't show over HTTP: its log (stdout) and its
// database file. It runs from this checkout on a throwaway data directory,
// and is killed without warning (SIGKILL), the way a machine dies.
import { spawn, type ChildProcess } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

export interface OwnServer {
  baseUrl: string;
  dataDir: string;
  // everything it has printed to stdout so far, one entry per line
  lines: string[];
  start(): Promise<void>;
  kill(): Promise<void>;
  // kill it and delete its data
  stop(): Promise<void>;
}

export function ownServer(): OwnServer {
  const port = 18_000 + Math.floor(Math.random() * 2000);
  const baseUrl = `http://localhost:${port}`;
  const dataDir = mkdtempSync(join(tmpdir(), "relay-spec-"));
  const lines: string[] = [];
  let child: ChildProcess | null = null;

  async function start(): Promise<void> {
    child = spawn(process.execPath, ["server/main.ts"], {
      env: { ...process.env, PORT: String(port), DATA_DIR: dataDir },
      stdio: ["ignore", "pipe", "inherit"],
    });
    let partial = "";
    child.stdout!.setEncoding("utf8").on("data", (chunk: string) => {
      const parts = (partial + chunk).split("\n");
      partial = parts.pop()!;
      lines.push(...parts);
    });
    for (let i = 0; i < 100; i++) {
      try {
        await fetch(baseUrl);
        return;
      } catch {
        await new Promise((r) => setTimeout(r, 100));
      }
    }
    throw new Error("server didn't start");
  }

  async function kill(): Promise<void> {
    if (!child || child.exitCode !== null) return;
    const exited = new Promise((r) => child!.once("exit", r));
    child.kill("SIGKILL");
    await exited;
  }

  async function stop(): Promise<void> {
    await kill();
    rmSync(dataDir, { recursive: true, force: true });
  }

  return { baseUrl, dataDir, lines, start, kill, stop };
}
