#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";

function parseArgs(argv) {
  const args = {
    config: "scripts/prompt-quality-gate.json",
  };

  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (token === "--config") {
      args.config = argv[i + 1] ?? args.config;
      i += 1;
    }
  }

  return args;
}

function readText(filePath) {
  return fs.readFileSync(filePath, "utf-8");
}

function runCheck(root, check) {
  const targetPath = path.resolve(root, check.file);
  if (!fs.existsSync(targetPath)) {
    return {
      id: check.id,
      status: "FAIL",
      details: `File not found: ${check.file}`,
    };
  }

  const text = readText(targetPath);

  if (Array.isArray(check.contains)) {
    for (const phrase of check.contains) {
      if (!text.includes(phrase)) {
        return {
          id: check.id,
          status: "FAIL",
          details: `Missing required text in ${check.file}: ${phrase}`,
        };
      }
    }
  }

  if (Array.isArray(check.notContains)) {
    for (const phrase of check.notContains) {
      if (text.includes(phrase)) {
        return {
          id: check.id,
          status: "FAIL",
          details: `Found banned text in ${check.file}: ${phrase}`,
        };
      }
    }
  }

  if (Array.isArray(check.regex)) {
    for (const pattern of check.regex) {
      const re = new RegExp(pattern, "m");
      if (!re.test(text)) {
        return {
          id: check.id,
          status: "FAIL",
          details: `Missing regex pattern in ${check.file}: /${pattern}/`,
        };
      }
    }
  }

  return {
    id: check.id,
    status: "PASS",
    details: check.file,
  };
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const root = process.cwd();
  const configPath = path.resolve(root, args.config);

  if (!fs.existsSync(configPath)) {
    console.error(`Prompt gate config not found: ${configPath}`);
    process.exit(1);
  }

  const config = JSON.parse(fs.readFileSync(configPath, "utf-8"));
  const checks = Array.isArray(config.checks) ? config.checks : [];

  if (!checks.length) {
    console.error("No checks configured.");
    process.exit(1);
  }

  console.log("Prompt Quality Gate");
  console.log(`- config=${path.relative(root, configPath)}`);

  let failed = 0;
  for (const check of checks) {
    const result = runCheck(root, check);
    console.log(`- ${result.id}: ${result.status} (${result.details})`);
    if (result.status !== "PASS") {
      failed += 1;
    }
  }

  if (failed > 0) {
    console.error(`Prompt quality gate failed with ${failed} failing check(s).`);
    process.exit(1);
  }

  console.log("Prompt quality gate passed.");
}

main();
