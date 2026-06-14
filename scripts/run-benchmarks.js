'use strict';

const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const http = require('http');

const ROOT = path.join(__dirname, '..');

const FRAMEWORKS = {
  express: {
    port: 3001,
    cwd: path.join(ROOT, 'servers', 'express'),
    single: ['node', ['src/app.js']],
    cluster: ['node', ['src/cluster.js']],
    workers: ['node', ['src/app.js']],
    workersEnv: { USE_WORKER_THREADS: 'true' },
  },
  fastify: {
    port: 3002,
    cwd: path.join(ROOT, 'servers', 'fastify'),
    single: ['node', ['src/app.js']],
    cluster: ['node', ['src/cluster.js']],
    workers: ['node', ['src/app.js']],
    workersEnv: { USE_WORKER_THREADS: 'true' },
  },
  nestjs: {
    port: 3003,
    cwd: path.join(ROOT, 'servers', 'nestjs'),
    single: ['node', ['dist/main.js']],
    cluster: ['node', ['dist/cluster.js']],
    workers: ['node', ['dist/main.js']],
    workersEnv: { USE_WORKER_THREADS: 'true' },
    prebuild: ['npm', ['run', 'build']],
  },
};

const TEST_SCRIPTS = {
  static: 'static.js',
  transform: 'transform.js',
  'io-simulate': 'io-simulate.js',
  hash: 'hash.js',
  compute: 'compute.js',
  concurrency: 'concurrency.js',
};

const PROFILES = {
  standard: {
    label: 'standard (~1 ч)',
    duration: '20s',
    clusterWorkers: 4,
    k6Env: {
      RECORD_COUNT: '1500',
      VALUE_SIZE: '1024',
      ARRAY_SIZE: '500000',
      HASH_ROUNDS: '300',
    },
    rps: {
      static: [100, 1000],
      transform: [10, 30],
      'io-simulate': [100, 500],
      hash: [20, 100],
      compute: [10, 30],
      concurrency: [500],
    },
  },
  quick: {
    label: 'quick (~25 мин)',
    duration: '15s',
    clusterWorkers: 4,
    k6Env: {
      RECORD_COUNT: '1000',
      VALUE_SIZE: '1024',
      ARRAY_SIZE: '500000',
      HASH_ROUNDS: '200',
    },
    rps: {
      static: [100],
      transform: [10],
      'io-simulate': [100],
      hash: [20],
      compute: [10],
      concurrency: [300],
    },
  },
  full: {
    label: 'full (~3–4 ч)',
    duration: '30s',
    clusterWorkers: null,
    k6Env: {},
    rps: {
      static: [100, 500, 1000, 3000],
      transform: [10, 20, 50],
      'io-simulate': [100, 300, 500, 1000],
      hash: [20, 50, 100, 200],
      compute: [10, 20, 40],
      concurrency: [2000],
    },
  },
};

const TESTS = Object.fromEntries(
  Object.entries(TEST_SCRIPTS).map(([name, script]) => [name, { script }])
);

const MODES = ['single', 'cluster', 'workers'];

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function runCommand(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      stdio: options.silent ? 'ignore' : 'inherit',
      shell: options.shell ?? false,
      ...options,
    });

    child.on('error', reject);
    child.on('exit', (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`${command} ${args.join(' ')} exited with code ${code}`));
      }
    });
  });
}

function waitForHealth(baseUrl, timeoutMs = 30000) {
  const started = Date.now();

  return new Promise((resolve, reject) => {
    const attempt = () => {
      const request = http.get(`${baseUrl}/health`, (response) => {
        response.resume();
        if (response.statusCode === 200) {
          resolve();
          return;
        }
        retry();
      });

      request.on('error', retry);
      request.setTimeout(2000, () => {
        request.destroy();
        retry();
      });
    };

    const retry = () => {
      if (Date.now() - started > timeoutMs) {
        reject(new Error(`Server did not become healthy: ${baseUrl}`));
        return;
      }
      setTimeout(attempt, 500);
    };

    attempt();
  });
}

function startServer(frameworkName, mode, profile) {
  const framework = FRAMEWORKS[frameworkName];
  const [command, args] = framework[mode];
  const env = {
    ...process.env,
    PORT: String(framework.port),
    ...(mode === 'workers' ? framework.workersEnv : {}),
  };

  if (mode === 'cluster' && profile.clusterWorkers) {
    env.CLUSTER_WORKERS = String(profile.clusterWorkers);
  }

  const child = spawn(command, args, {
    cwd: framework.cwd,
    env,
    stdio: ['ignore', 'pipe', 'pipe'],
    shell: process.platform === 'win32',
  });

  return child;
}

function stopServer(child) {
  if (!child || child.killed) {
    return Promise.resolve();
  }

  return new Promise((resolve) => {
    child.on('exit', () => resolve());

    if (process.platform === 'win32') {
      spawn('taskkill', ['/pid', String(child.pid), '/f', '/t'], { shell: true })
        .on('exit', () => resolve());
    } else {
      child.kill('SIGTERM');
      setTimeout(() => {
        if (!child.killed) {
          child.kill('SIGKILL');
        }
      }, 3000);
    }
  });
}

function parseK6Summary(stdout) {
  try {
    return JSON.parse(stdout);
  } catch {
    return null;
  }
}

function getMetricValues(metric) {
  if (!metric) {
    return {};
  }
  return metric.values || metric;
}

function extractMetrics(summary) {
  if (!summary || !summary.metrics) {
    return null;
  }

  const metrics = summary.metrics;
  const duration = getMetricValues(metrics.http_req_duration);
  const reqs = getMetricValues(metrics.http_reqs);
  const failed = getMetricValues(metrics.http_req_failed);
  const iterations = getMetricValues(metrics.iterations);

  return {
    rps: reqs.rate || iterations.rate || 0,
    avgLatencyMs: duration.avg || 0,
    medLatencyMs: duration.med || 0,
    p95LatencyMs: duration['p(95)'] || 0,
    maxLatencyMs: duration.max || 0,
    totalRequests: reqs.count || iterations.count || 0,
    failedRate: failed.rate ?? failed.value ?? 0,
  };
}

async function sampleProcessStats(child, durationMs = 10000, intervalMs = 1000) {
  let pidusage;
  try {
    pidusage = require('pidusage');
  } catch {
    return { avgRssMb: 0, maxRssMb: 0, avgCpuPercent: 0 };
  }

  const samples = [];
  const endAt = Date.now() + durationMs;

  while (Date.now() < endAt && child && !child.killed) {
    try {
      const stats = await pidusage(child.pid);
      samples.push({
        rssMb: stats.memory / (1024 * 1024),
        cpuPercent: stats.cpu,
      });
    } catch {
    }
    await sleep(intervalMs);
  }

  if (samples.length === 0) {
    return { avgRssMb: 0, maxRssMb: 0, avgCpuPercent: 0 };
  }

  const rssValues = samples.map((s) => s.rssMb);
  const cpuValues = samples.map((s) => s.cpuPercent);

  return {
    avgRssMb: rssValues.reduce((a, b) => a + b, 0) / rssValues.length,
    maxRssMb: Math.max(...rssValues),
    avgCpuPercent: cpuValues.reduce((a, b) => a + b, 0) / cpuValues.length,
  };
}

function resolveK6Path() {
  const fs = require('fs');
  const candidates = ['k6'];

  if (process.platform === 'win32') {
    candidates.push(
      'C:\\Program Files\\k6\\k6.exe',
      path.join(process.env.ProgramFiles || 'C:\\Program Files', 'k6', 'k6.exe')
    );
  }

  for (const candidate of candidates) {
    if (candidate === 'k6') {
      try {
        const { execSync } = require('child_process');
        execSync('k6 version', { stdio: 'ignore', shell: true });
        return 'k6';
      } catch {
        continue;
      }
    }

    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }

  return null;
}

function isK6Available() {
  return resolveK6Path() !== null;
}

async function runLoadTest(testName, baseUrl, targetRps, duration, profile) {
  if (isK6Available()) {
    return runK6(testName, baseUrl, targetRps, duration, profile);
  }

  console.log('k6 не найден, запуск через autocannon');
  const { runNodeLoadTest } = require('./node-load-test');
  const result = await runNodeLoadTest(testName, baseUrl, targetRps, duration);
  return {
    summaryPath: null,
    metrics: result.metrics,
    raw: result.raw,
    engine: result.engine,
  };
}

async function runK6(testName, baseUrl, targetRps, duration, profile) {
  const test = TESTS[testName];
  const scriptPath = path.join(ROOT, 'load-tests', test.script);
  const summaryPath = path.join(
    ROOT,
    'results',
    'raw',
    `${Date.now()}-${testName}-${targetRps}.json`
  );

  fs.mkdirSync(path.dirname(summaryPath), { recursive: true });

  const env = {
    ...process.env,
    ...profile.k6Env,
    BASE_URL: baseUrl,
    TARGET_RPS: String(targetRps),
    DURATION: duration,
  };

  if (testName === 'concurrency') {
    env.VUS = String(targetRps);
    env.RAMP_UP = profile.k6Env.RAMP_UP || '5s';
  }

  return new Promise((resolve, reject) => {
    const args = [
      'run',
      scriptPath,
      '--summary-export',
      summaryPath,
      '--quiet',
    ];

    const k6Path = resolveK6Path();
    const child = spawn(k6Path, args, {
      env,
      shell: false,
      stdio: ['ignore', 'ignore', 'pipe'],
    });

    let stderr = '';

    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });

    child.on('error', (error) => {
      reject(new Error(`Failed to run k6: ${error.message}. Install k6: https://k6.io/docs/get-started/installation/`));
    });

    child.on('exit', (code) => {
      if (code !== 0 && code !== 99) {
        reject(new Error(`k6 failed (${code}): ${stderr.slice(-2000)}`));
        return;
      }

      if (code === 99) {
        console.warn('k6: пороги превышены, метрики сохранены');
      }

      let summary = null;
      if (fs.existsSync(summaryPath)) {
        summary = JSON.parse(fs.readFileSync(summaryPath, 'utf8'));
      }

      resolve({
        summaryPath,
        metrics: extractMetrics(summary),
        raw: summary,
      });
    });
  });
}

async function resetCounter(baseUrl) {
  await fetch(`${baseUrl}/api/counter/reset`, { method: 'POST' }).catch(() => {});
}

async function ensureNestBuilt() {
  const distMain = path.join(ROOT, 'servers', 'nestjs', 'dist', 'main.js');
  if (!fs.existsSync(distMain)) {
    console.log('Сборка NestJS...');
    await runCommand('npm', ['run', 'build'], {
      cwd: path.join(ROOT, 'servers', 'nestjs'),
      shell: true,
    });
  }
}

async function runSingleBenchmark({ framework, mode, test, rps, duration, profile }) {
  if (framework === 'nestjs') {
    await ensureNestBuilt();
  }

  const config = FRAMEWORKS[framework];
  const baseUrl = `http://localhost:${config.port}`;
  const server = startServer(framework, mode, profile);

  try {
    await waitForHealth(baseUrl);
    await resetCounter(baseUrl);

    const statsPromise = sampleProcessStats(server, 12000, 1000);
    const k6Result = await runLoadTest(test, baseUrl, rps, duration, profile);
    const resourceStats = await statsPromise;

    let serverDied = false;
    try {
      await waitForHealth(baseUrl, 3000);
    } catch {
      serverDied = true;
      console.warn(`Сервер не отвечает после теста ${test}`);
    }

    return {
      framework,
      mode,
      test,
      targetRps: rps,
      duration,
      baseUrl,
      metrics: k6Result.metrics,
      resources: resourceStats,
      summaryPath: k6Result.summaryPath,
      serverDied,
      timestamp: new Date().toISOString(),
    };
  } finally {
    await stopServer(server);
    await sleep(1000);
  }
}

function parseArgs(argv) {
  const args = {
    profile: 'standard',
    framework: null,
    mode: null,
    test: null,
  };

  for (let i = 2; i < argv.length; i += 1) {
    const value = argv[i];
    if (value === '--quick') args.profile = 'quick';
    if (value === '--full') args.profile = 'full';
    if (value === '--profile') args.profile = argv[++i];
    if (value === '--framework') args.framework = argv[++i];
    if (value === '--mode') args.mode = argv[++i];
    if (value === '--test') args.test = argv[++i];
  }

  if (!PROFILES[args.profile]) {
    throw new Error(`Unknown profile: ${args.profile}. Use quick, standard, or full.`);
  }

  return args;
}

function buildPlan(args) {
  const profile = PROFILES[args.profile];
  const frameworks = args.framework ? [args.framework] : Object.keys(FRAMEWORKS);
  const modes = args.mode ? [args.mode] : MODES;
  const tests = args.test ? [args.test] : Object.keys(TEST_SCRIPTS);
  const plan = [];

  for (const framework of frameworks) {
    for (const mode of modes) {
      for (const test of tests) {
        const rpsList = profile.rps[test] || [profile.rps[Object.keys(profile.rps)[0]]];

        for (const rps of rpsList) {
          if (mode === 'workers' && !['hash', 'compute'].includes(test)) {
            continue;
          }

          plan.push({
            framework,
            mode,
            test,
            rps,
            duration: profile.duration,
            profile: args.profile,
          });
        }
      }
    }
  }

  return { plan, profile: PROFILES[args.profile], profileName: args.profile };
}

function estimateMinutes(plan, profile) {
  const durationSec = Number.parseInt(profile.duration, 10) || 20;
  const overheadSec = 10;
  return Math.ceil((plan.length * (durationSec + overheadSec)) / 60);
}

async function main() {
  const args = parseArgs(process.argv);
  const { plan, profile, profileName } = buildPlan(args);
  const results = [];

  fs.mkdirSync(path.join(ROOT, 'results'), { recursive: true });
  fs.mkdirSync(path.join(ROOT, 'results', 'raw'), { recursive: true });

  const eta = estimateMinutes(plan, profile);
  console.log(`Профиль: ${profile.label}`);
  console.log(`Прогонов: ${plan.length}, ~${eta} мин`);

  for (const item of plan) {
    console.log(`\n${item.framework} / ${item.mode} / ${item.test} @ ${item.rps} RPS`);

    try {
      const result = await runSingleBenchmark({
        framework: item.framework,
        mode: item.mode,
        test: item.test,
        rps: item.rps,
        duration: item.duration,
        profile,
      });
      results.push(result);
      console.log(
        `Готово: rps=${result.metrics?.rps?.toFixed?.(2) || 'n/a'}, p95=${result.metrics?.p95LatencyMs?.toFixed?.(2) || 'n/a'} ms`
      );
    } catch (error) {
      console.error(`Ошибка: ${error.message}`);
      results.push({
        ...item,
        error: error.message,
        profile: profileName,
        timestamp: new Date().toISOString(),
      });
    }
  }

  const outputFile = path.join(
    ROOT,
    'results',
    `benchmark-${Date.now()}.json`
  );
  fs.writeFileSync(outputFile, JSON.stringify(results, null, 2));
  console.log(`\nСохранено: ${outputFile}`);

  const { generateReport } = require('./generate-report');
  generateReport(outputFile);
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}

module.exports = {
  FRAMEWORKS,
  TESTS,
  runSingleBenchmark,
};
