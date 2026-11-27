// Headless 1-shot cloud runner (for GitHub Actions cron or Cloud VPS cron — runs even when your laptop is OFF!)
// Usage: node src/run-once.js [--style=inside-out] [--no-upload]
import { runShortPipeline } from './pipeline.js';

const args = process.argv.slice(2);
const styleArg = args.find((a) => a.startsWith('--style='))?.split('=')[1] || null;
const noUpload = args.includes('--no-upload');

try {
  const job = await runShortPipeline({ style: styleArg, upload: !noUpload });
  console.log('\nCLOUD RUN COMPLETE:', JSON.stringify({
    id: job.id,
    title: job.title,
    style: job.style,
    generatedBy: job.generatedBy,
    status: job.status,
    youtubeUrl: job.youtubeUrl || null,
  }, null, 2));
  process.exit(0);
} catch (err) {
  console.error('CLOUD RUN FAILED:', err.message);
  process.exit(1);
}
