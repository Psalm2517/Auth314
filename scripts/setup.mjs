#!/usr/bin/env node
// Interactive config for Auth314. Writes .dev.vars for local development and,
// optionally, pushes the same values to Cloudflare as secrets.
//
//   npm run setup

import { createInterface } from "node:readline/promises";
import { stdin, stdout, env, exit } from "node:process";
import { writeFileSync, existsSync, readFileSync } from "node:fs";
import { randomBytes } from "node:crypto";
import { spawnSync } from "node:child_process";

const DEV_VARS = ".dev.vars";
const rl = createInterface({ input: stdin, output: stdout });

/**
 * Once stdin ends there is nobody left to answer, so every remaining prompt
 * takes its default. Without this the script hangs when piped or run in CI
 * instead of being typed into by a human.
 */
let closed = false;
const stdinClosed = new Promise((resolve) =>
  rl.once("close", () => {
    closed = true;
    resolve(null);
  }),
);

function generateSecret() {
  return randomBytes(32).toString("base64");
}

/**
 * Best existing value for a name: the environment wins so this can be driven
 * non-interactively, then whatever a previous run wrote to .dev.vars.
 */
function existing(name) {
  if (env[name]) return env[name];
  if (!existsSync(DEV_VARS)) return "";
  const line = readFileSync(DEV_VARS, "utf8")
    .split("\n")
    .find((l) => l.startsWith(`${name}=`));
  return line ? line.slice(name.length + 1).trim() : "";
}

async function ask(question, fallback = "") {
  if (closed) return fallback;
  const suffix = fallback ? ` [${fallback}]` : "";
  let answer;
  try {
    answer = await Promise.race([rl.question(`${question}${suffix}: `), stdinClosed]);
  } catch {
    return fallback; // readline closed underneath us
  }
  if (answer === null) {
    stdout.write("\n");
    return fallback;
  }
  return answer.trim() || fallback;
}

async function main() {
  console.log("\nAuth314 setup\n");
  console.log("Two values are required. Everything else has a working default.\n");

  const clientId = await ask(
    "PI_CLIENT_ID (Pi Developer Portal > your app > Pi Sign-in)",
    existing("PI_CLIENT_ID"),
  );
  if (!clientId) {
    console.error("\nPI_CLIENT_ID is required. Nothing written.");
    exit(1);
  }

  const priorSecret = existing("AUTH_SECRET");
  const authSecret = await ask(
    "AUTH_SECRET (blank generates one)",
    priorSecret || generateSecret(),
  );

  console.log("\nOptional. Leave blank unless you're behind a proxy that rewrites Host.");
  const publicUrl = await ask("PUBLIC_URL", existing("PUBLIC_URL"));

  const lines = [
    "# Local development only. Gitignored. Read by `wrangler dev`.",
    "# Production values live in Cloudflare, set below or via the dashboard.",
    `PI_CLIENT_ID=${clientId}`,
    `AUTH_SECRET=${authSecret}`,
  ];
  if (publicUrl) lines.push(`PUBLIC_URL=${publicUrl}`);
  writeFileSync(DEV_VARS, lines.join("\n") + "\n");
  console.log(`\nWrote ${DEV_VARS}. \`npm run dev\` will pick it up.`);

  const push = (await ask("\nPush these to Cloudflare as secrets now? (y/N)", "N"))
    .toLowerCase()
    .startsWith("y");

  if (!push) {
    console.log("\nSkipped. When you're ready:");
    console.log("  npx wrangler secret put PI_CLIENT_ID");
    console.log("  npx wrangler secret put AUTH_SECRET");
    rl.close();
    return;
  }

  const secrets = { PI_CLIENT_ID: clientId, AUTH_SECRET: authSecret };
  if (publicUrl) secrets.PUBLIC_URL = publicUrl;

  for (const [name, value] of Object.entries(secrets)) {
    console.log(`\nSetting ${name}...`);
    const res = spawnSync("npx", ["wrangler", "secret", "put", name], {
      input: value,
      stdio: ["pipe", "inherit", "inherit"],
    });
    if (res.status !== 0) {
      console.error(`\nFailed to set ${name}. Are you logged in? Try: npx wrangler login`);
      rl.close();
      exit(1);
    }
  }

  console.log("\nDone. Deploy with: npx wrangler deploy");
  console.log("Then register https://<your-worker-url>/callback in the Pi Developer Portal.");
  rl.close();
}

main().catch((err) => {
  console.error(err);
  rl.close();
  exit(1);
});
