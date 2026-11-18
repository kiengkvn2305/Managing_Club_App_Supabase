import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { existsSync } from "node:fs";

export const root = dirname(dirname(fileURLToPath(import.meta.url)));
export function npmArgs(args) {
  const cli = [process.env.npm_execpath, join(dirname(process.execPath), "node_modules/npm/bin/npm-cli.js"), join(dirname(process.execPath), "../lib/node_modules/npm/bin/npm-cli.js"), "/usr/share/nodejs/npm/bin/npm-cli.js", "/usr/lib/node_modules/npm/bin/npm-cli.js"].filter(Boolean).find(existsSync);
  if (!cli) throw new Error("Không tìm thấy npm CLI.");
  return [cli, ...args];
}
export function run(command, args, cwd = root, env = process.env) {
  const result = spawnSync(command, args, { cwd, env, stdio: "inherit", windowsHide: true });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`Command failed (${result.status}): ${command}`);
}
