import cluster from 'cluster';
import os from 'os';
import { bootstrap } from './main';

const WORKERS = Number(process.env.CLUSTER_WORKERS || os.cpus().length);

if (cluster.isPrimary) {
  console.log(`NestJS cluster, workers: ${WORKERS}`);

  for (let i = 0; i < WORKERS; i += 1) {
    cluster.fork();
  }

  cluster.on('exit', (worker) => {
    console.log(`Worker ${worker.process.pid} stopped, restart`);
    cluster.fork();
  });
} else {
  bootstrap().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
