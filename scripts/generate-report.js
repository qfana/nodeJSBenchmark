'use strict';

const fs = require('fs');
const path = require('path');

function formatNumber(value, digits = 2) {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return 'n/a';
  }
  return Number(value).toFixed(digits);
}

function generateReport(inputFile) {
  if (!inputFile) {
    throw new Error('Input file is required');
  }

  const results = JSON.parse(fs.readFileSync(inputFile, 'utf8'));
  const reportDir = path.join(path.dirname(inputFile), 'reports');
  fs.mkdirSync(reportDir, { recursive: true });

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const markdownPath = path.join(reportDir, `report-${timestamp}.md`);
  const csvPath = path.join(reportDir, `report-${timestamp}.csv`);

  const successful = results.filter((item) => item.metrics);
  const failed = results.filter((item) => item.error);

  const rows = successful
    .map((item) => ({
      framework: item.framework,
      mode: item.mode,
      test: item.test,
      targetRps: item.targetRps,
      actualRps: item.metrics.rps,
      avgMs: item.metrics.avgLatencyMs,
      medMs: item.metrics.medLatencyMs,
      p95Ms: item.metrics.p95LatencyMs,
      failedRate: item.metrics.failedRate,
      avgRssMb: item.resources?.avgRssMb || 0,
      maxRssMb: item.resources?.maxRssMb || 0,
    }))
    .sort((a, b) => b.actualRps - a.actualRps);

  const csvHeader = [
    'framework',
    'mode',
    'test',
    'target_rps',
    'actual_rps',
    'avg_ms',
    'med_ms',
    'p95_ms',
    'failed_rate',
    'avg_rss_mb',
    'max_rss_mb',
  ].join(',');

  const csvBody = rows
    .map((row) =>
      [
        row.framework,
        row.mode,
        row.test,
        row.targetRps,
        formatNumber(row.actualRps),
        formatNumber(row.avgMs),
        formatNumber(row.medMs),
        formatNumber(row.p95Ms),
        formatNumber(row.failedRate, 4),
        formatNumber(row.avgRssMb),
        formatNumber(row.maxRssMb),
      ].join(',')
    )
    .join('\n');

  fs.writeFileSync(csvPath, `${csvHeader}\n${csvBody}\n`);

  const tableLines = rows
    .map(
      (row) =>
        `| ${row.framework} | ${row.mode} | ${row.test} | ${row.targetRps} | ${formatNumber(row.actualRps)} | ${formatNumber(row.avgMs)} | ${formatNumber(row.medMs)} | ${formatNumber(row.p95Ms)} | ${formatNumber(row.failedRate, 4)} | ${formatNumber(row.avgRssMb)} |`
    )
    .join('\n');

  const errorLines =
    failed.length === 0
      ? 'нет'
      : failed.map((item) => `${item.framework}/${item.mode}/${item.test}: ${item.error}`).join('\n');

  const markdown = `# Сводка бенчмарка

Дата: ${new Date().toLocaleString('ru-RU')}
Файл: \`${path.basename(inputFile)}\`

| Framework | Mode | Test | Target RPS | Actual RPS | Avg ms | Med ms | P95 ms | Fail rate | Avg RSS MB |
|---|---|---|---:|---:|---:|---:|---:|---:|---:|
${tableLines}

Ошибки прогонов: ${errorLines}
`;

  fs.writeFileSync(markdownPath, markdown);
  console.log('Report:', markdownPath);
  console.log('CSV:', csvPath);

  return { markdownPath, csvPath };
}

module.exports = { generateReport };

if (require.main === module) {
  const inputFile = process.argv[2];
  if (!inputFile) {
    console.error('Usage: node generate-report.js <benchmark-results.json>');
    process.exit(1);
  }
  generateReport(inputFile);
}
