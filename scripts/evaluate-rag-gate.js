#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";

function parseArgs(argv) {
  const args = {
    input: null,
    config: null,
    baseline: null,
    candidate: null,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (token === "--input") {
      args.input = argv[i + 1] ?? null;
      i += 1;
    } else if (token === "--config") {
      args.config = argv[i + 1] ?? null;
      i += 1;
    } else if (token === "--baseline") {
      args.baseline = argv[i + 1] ?? null;
      i += 1;
    } else if (token === "--candidate") {
      args.candidate = argv[i + 1] ?? null;
      i += 1;
    }
  }

  return args;
}

function reciprocalRank(sortedIds, relevant) {
  for (let i = 0; i < sortedIds.length; i += 1) {
    if (relevant.has(sortedIds[i])) {
      return 1 / (i + 1);
    }
  }
  return 0;
}

function dcgAtK(sortedIds, relevant, k) {
  let dcg = 0;
  for (let i = 0; i < Math.min(k, sortedIds.length); i += 1) {
    const gain = relevant.has(sortedIds[i]) ? 1 : 0;
    if (gain) {
      dcg += gain / Math.log2(i + 2);
    }
  }
  return dcg;
}

function ndcgAtK(sortedIds, relevant, k) {
  const dcg = dcgAtK(sortedIds, relevant, k);
  const idealCount = Math.min(k, relevant.size);
  if (idealCount === 0) {
    return 0;
  }

  let idcg = 0;
  for (let i = 0; i < idealCount; i += 1) {
    idcg += 1 / Math.log2(i + 2);
  }

  return idcg === 0 ? 0 : dcg / idcg;
}

function recallAtK(sortedIds, relevant, k) {
  if (!relevant.size) {
    return 0;
  }

  const topK = new Set(sortedIds.slice(0, k));
  let hits = 0;
  for (const id of relevant) {
    if (topK.has(id)) {
      hits += 1;
    }
  }

  return hits / relevant.size;
}

function toRankedIds(run) {
  return (run.candidates || [])
    .slice()
    .sort((a, b) => (Number(b.score) || 0) - (Number(a.score) || 0))
    .map((item) => String(item.id));
}

function evaluateRun(dataset, runName, kValues) {
  const queryById = new Map((dataset.queries || []).map((q) => [q.id, q]));
  const rows = [];

  for (const run of dataset.runs || []) {
    if (run.name !== runName) {
      continue;
    }

    const query = queryById.get(run.queryId);
    if (!query) {
      continue;
    }

    const relevant = new Set((query.relevantIds || []).map((id) => String(id)));
    const rankedIds = toRankedIds(run);

    const row = {
      rr: reciprocalRank(rankedIds, relevant),
      metric: {},
    };

    for (const k of kValues) {
      row.metric[`Recall@${k}`] = recallAtK(rankedIds, relevant, k);
      row.metric[`nDCG@${k}`] = ndcgAtK(rankedIds, relevant, k);
    }

    rows.push(row);
  }

  if (!rows.length) {
    return null;
  }

  const summary = {
    MRR: 0,
  };
  for (const k of kValues) {
    summary[`Recall@${k}`] = 0;
    summary[`nDCG@${k}`] = 0;
  }

  for (const row of rows) {
    summary.MRR += row.rr;
    for (const k of kValues) {
      summary[`Recall@${k}`] += row.metric[`Recall@${k}`];
      summary[`nDCG@${k}`] += row.metric[`nDCG@${k}`];
    }
  }

  summary.MRR /= rows.length;
  for (const k of kValues) {
    summary[`Recall@${k}`] /= rows.length;
    summary[`nDCG@${k}`] /= rows.length;
  }

  return summary;
}

function getValue(summary, key) {
  const value = Number(summary[key]);
  return Number.isFinite(value) ? value : 0;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const root = process.cwd();

  const inputPath = path.resolve(root, args.input ?? "scripts/rag-eval-sample.json");
  const configPath = path.resolve(root, args.config ?? "scripts/rag-quality-gate.json");
  const baselineName = args.baseline ?? "phase1-baseline";
  const candidateName = args.candidate ?? "phase2-rerank";

  if (!fs.existsSync(inputPath)) {
    console.error(`Input file not found: ${inputPath}`);
    process.exit(1);
  }

  if (!fs.existsSync(configPath)) {
    console.error(`Config file not found: ${configPath}`);
    process.exit(1);
  }

  const dataset = JSON.parse(fs.readFileSync(inputPath, "utf-8"));
  const config = JSON.parse(fs.readFileSync(configPath, "utf-8"));

  const kValues = Array.isArray(dataset.kValues) && dataset.kValues.length
    ? dataset.kValues.map((k) => Number(k)).filter((k) => Number.isFinite(k) && k > 0)
    : [3, 5];

  const baseline = evaluateRun(dataset, baselineName, kValues);
  const candidate = evaluateRun(dataset, candidateName, kValues);

  if (!baseline) {
    console.error(`Baseline run not found: ${baselineName}`);
    process.exit(1);
  }

  if (!candidate) {
    console.error(`Candidate run not found: ${candidateName}`);
    process.exit(1);
  }

  const required = config.required || {};
  const maxRegression = config.maxRegression || {};
  const metricKeys = Array.from(new Set([
    ...Object.keys(required),
    ...Object.keys(maxRegression),
    "MRR",
    ...kValues.flatMap((k) => [`Recall@${k}`, `nDCG@${k}`]),
  ]));

  let failed = false;

  console.log("RAG Quality Gate");
  console.log(`- baseline=${baselineName}`);
  console.log(`- candidate=${candidateName}`);

  for (const key of metricKeys) {
    const baselineValue = getValue(baseline, key);
    const candidateValue = getValue(candidate, key);
    const delta = candidateValue - baselineValue;

    const minRequired = Number(required[key]);
    const hasMinRequired = Number.isFinite(minRequired);
    const regressionLimit = Number(maxRegression[key]);
    const hasRegressionLimit = Number.isFinite(regressionLimit);

    let status = "PASS";

    if (hasMinRequired && candidateValue < minRequired) {
      status = "FAIL";
      failed = true;
    }

    if (hasRegressionLimit && baselineValue - candidateValue > regressionLimit) {
      status = "FAIL";
      failed = true;
    }

    console.log(
      `- ${key}: base=${baselineValue.toFixed(4)} cand=${candidateValue.toFixed(4)} delta=${delta.toFixed(4)} => ${status}`,
    );
  }

  if (failed) {
    console.error("Quality gate failed.");
    process.exit(1);
  }

  console.log("Quality gate passed.");
}

main();
