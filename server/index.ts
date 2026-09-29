import { DeepSeekService } from './deepseek';
import { createGateway, listenGateway } from './http';

try {
  process.loadEnvFile?.('.env.local');
} catch {
  // The gateway will report a focused key error below.
}

const apiKey = process.env.DEEPSEEK_API_KEY;
if (!apiKey) throw new Error('缺少 DEEPSEEK_API_KEY，请配置 .env.local');

const service = new DeepSeekService({
  apiKey,
  model: process.env.DEEPSEEK_MODEL,
  baseUrl: process.env.DEEPSEEK_BASE_URL,
});
const server = createGateway({ service, sensitiveValues: [apiKey] });
const port = Number(process.env.DEEPSEEK_GATEWAY_PORT ?? 8787);

await listenGateway(server, port);
console.log(`DeepSeek gateway listening on http://127.0.0.1:${port}`);
