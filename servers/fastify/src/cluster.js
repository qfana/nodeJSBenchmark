'use strict';

const cluster = require('cluster');
const os = require('os');
const { createApp, PORT } = require('./app');

const WORKERS = Number(process.env.CLUSTER_WORKERS || os.cpus().length);

if (cluster.isPrimary) {
  console.log(`Fastify cluster, workers: ${WORKERS}`);

  for (let i = 0; i < WORKERS; i += 1) {
    cluster.fork();
  }

  cluster.on('exit', (worker) => {
    console.log(`Worker ${worker.process.pid} stopped, restart`);
    cluster.fork();
  });
} else {
  createApp()
    .listen({ port: PORT, host: '0.0.0.0' })
    .then(() => {
      console.log(`Fastify worker ${process.pid}, port ${PORT}`);
    })
    .catch((error) => {
      console.error(error);
      process.exit(1);
    });
}
