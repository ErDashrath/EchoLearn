#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";

function parseArgs(argv) {
  const args = {
    input: null,
    out: null,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (token === "--input") {
      args.input = argv[i + 1] ?? null;
      i += 1;
    } else if (token === "--out") {
      args.out = argv[i + 1] ?? null;
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

  if (idcg === 0) {
    return 0;
  }
  return dcg / idcg;
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
  const candidates = Array.isArray(run.candidates) ? run.candidates : [];
  return candidates
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
      queryId: run.queryId,
      rr: reciprocalRank(rankedIds, relevant),
      ndcg: {},
      recall: {},
    };

    for (const k of kValues) {
      row.ndcg[`nDCG@${k}`] = ndcgAtK(rankedIds, relevant, k);
      row.recall[`Recall@${k}`] = recallAtK(rankedIds, relevant, k);
    }

    rows.push(row);
  }

  if (!rows.length) {
    return null;
  }

  const summary = {
    runName,
    queryCount: rows.length,
    MRR: 0,
  };

  for (const k of kValues) {
    summary[`nDCG@${k}`] = 0;
    summary[`Recall@${k}`] = 0;
  }

  for (const row of rows) {
    summary.MRR += row.rr;
    for (const k of kValues) {
      summary[`nDCG@${k}`] += row.ndcg[`nDCG@${k}`];
      summary[`Recall@${k}`] += row.recall[`Recall@${k}`];
    }
  }

  summary.MRR /= rows.length;
  for (const k of kValues) {
    summary[`nDCG@${k}`] /= rows.length;
    summary[`Recall@${k}`] /= rows.length;
  }

  return { summary, rows };
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const root = process.cwd();
  const defaultInput = path.join(root, "scripts", "rag-eval-sample.json");
  const inputPath = args.input ? path.resolve(root, args.input) : defaultInput;
  const outputPath = args.out ? path.resolve(root, args.out) : null;

  if (!fs.existsSync(inputPath)) {
    console.error(`Input file not found: ${inputPath}`);
    process.exit(1);
  }

  const dataset = JSON.parse(fs.readFileSync(inputPath, "utf-8"));
  const kValues = Array.isArray(dataset.kValues) && dataset.kValues.length
    ? dataset.kValues.map((k) => Number(k)).filter((k) => Number.isFinite(k) && k > 0)
    : [3, 5];

  const runNames = Array.from(new Set((dataset.runs || []).map((run) => run.name))).filter(Boolean);
  const reports = [];

  for (const runName of runNames) {
    const report = evaluateRun(dataset, runName, kValues);
    if (report) {
      reports.push(report);
    }
  }

  if (!reports.length) {
    console.error("No valid runs found in dataset.");
    process.exit(1);
  }

  const payload = {
    generatedAt: new Date().toISOString(),
    inputPath,
    kValues,
    reports,
  };

  if (outputPath) {
    fs.writeFileSync(outputPath, JSON.stringify(payload, null, 2));
  }

  console.log("RAG Evaluation Summary");
  for (const report of reports) {
    const summary = report.summary;
    const bits = [`run=${summary.runName}`, `queries=${summary.queryCount}`, `MRR=${summary.MRR.toFixed(4)}`];
    for (const k of kValues) {
      bits.push(`Recall@${k}=${summary[`Recall@${k}`].toFixed(4)}`);
      bits.push(`nDCG@${k}=${summary[`nDCG@${k}`].toFixed(4)}`);
    }
    console.log(`- ${bits.join(" | ")}`);
  }

  if (outputPath) {
    console.log(`Saved report to ${outputPath}`);
  }
}

main();
