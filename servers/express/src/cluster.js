'use strict';

const cluster = require('cluster');
const os = require('os');
const { createApp, PORT } = require('./app');

const WORKERS = Number(process.env.CLUSTER_WORKERS || os.cpus().length);

if (cluster.isPrimary) {
  console.log(`Express cluster, workers: ${WORKERS}`);

  for (let i = 0; i < WORKERS; i += 1) {
    cluster.fork();
  }

  cluster.on('exit', (worker) => {
    console.log(`Worker ${worker.process.pid} stopped, restart`);
    cluster.fork();
  });
} else {
  createApp().listen(PORT, () => {
    console.log(`Express worker ${process.pid}, port ${PORT}`);
  });
}
