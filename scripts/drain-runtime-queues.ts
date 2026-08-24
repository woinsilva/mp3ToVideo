import { Queue } from 'bullmq';

const queueNames = ['children-clip-production', 'project-processing', 'frame-interpolation'] as const;
const connection = { host: process.env.REDIS_HOST ?? '127.0.0.1', port: Number(process.env.REDIS_PORT ?? 6379), maxRetriesPerRequest: null };

async function main() {
  for (const name of queueNames) {
    const queue = new Queue(name, { connection });
    const before = await queue.getJobCounts('waiting', 'active', 'delayed', 'paused');
    if (before.active > 0) throw new Error(`Queue ${name} still has ${before.active} active job(s); stop its worker before draining.`);
    await queue.drain(true);
    const after = await queue.getJobCounts('waiting', 'active', 'delayed', 'paused');
    console.log(JSON.stringify({ queue: name, before, after }));
    await queue.close();
  }
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
