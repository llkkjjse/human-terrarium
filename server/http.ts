import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';

interface GatewayService {
  generateWorld(input: any): Promise<unknown>;
  compilePolicy(input: any): Promise<unknown>;
  parseAbsoluteEvent(input: any): Promise<unknown>;
  runFrame(input: any): Promise<unknown>;
}

interface GatewayDependencies {
  service: GatewayService;
  maxBodyBytes?: number;
  maxTextLength?: number;
  sensitiveValues?: string[];
}

class BodyTooLargeError extends Error {}

function send(response: ServerResponse, status: number, body: unknown): void {
  response.writeHead(status, { 'content-type': 'application/json; charset=utf-8' });
  response.end(JSON.stringify(body));
}

function readBody(request: IncomingMessage, maxBytes: number): Promise<unknown> {
  return new Promise((resolve, reject) => {
    let size = 0;
    let overflow = false;
    const chunks: Buffer[] = [];
    request.on('data', (chunk: Buffer) => {
      size += chunk.length;
      if (size > maxBytes) {
        overflow = true;
        return;
      }
      chunks.push(chunk);
    });
    request.on('end', () => {
      if (overflow) return reject(new BodyTooLargeError('request body too large'));
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')));
      } catch {
        reject(new Error('invalid json'));
      }
    });
    request.on('error', reject);
  });
}

function hasOversizedText(value: unknown, maxLength: number): boolean {
  if (typeof value === 'string') return value.length > maxLength;
  if (Array.isArray(value)) return value.some((item) => hasOversizedText(item, maxLength));
  if (value && typeof value === 'object') return Object.values(value).some((item) => hasOversizedText(item, maxLength));
  return false;
}

export function createGateway(dependencies: GatewayDependencies): Server {
  const maxBodyBytes = dependencies.maxBodyBytes ?? 256 * 1024;
  const maxTextLength = dependencies.maxTextLength ?? 8_000;
  const routes = {
    '/api/world/generate': dependencies.service.generateWorld.bind(dependencies.service),
    '/api/policy/compile': dependencies.service.compilePolicy.bind(dependencies.service),
    '/api/event/parse': dependencies.service.parseAbsoluteEvent.bind(dependencies.service),
    '/api/frame/run': dependencies.service.runFrame.bind(dependencies.service),
  } as const;
  return createServer(async (request, response) => {
    if (request.method !== 'POST' || !request.url || !(request.url in routes)) {
      send(response, 404, { error: '未找到接口' });
      return;
    }
    const contentLength = Number(request.headers['content-length'] ?? 0);
    if (contentLength > maxBodyBytes) {
      request.resume();
      send(response, 413, { error: '请求体过大' });
      return;
    }
    try {
      const body = await readBody(request, maxBodyBytes);
      if (hasOversizedText(body, maxTextLength)) {
        send(response, 400, { error: '自然语言字段过长' });
        return;
      }
      const handler = routes[request.url as keyof typeof routes] as (input: never) => Promise<unknown>;
      send(response, 200, await handler(body as never));
    } catch (error) {
      if (error instanceof BodyTooLargeError) {
        send(response, 413, { error: '请求体过大' });
        return;
      }
      const raw = error instanceof Error ? error.message : '';
      const containsSensitive = dependencies.sensitiveValues?.some((value) => value && raw.includes(value));
      void containsSensitive;
      send(response, raw === 'invalid json' ? 400 : 502, {
        error: raw === 'invalid json' ? 'JSON 请求无效' : 'AI 网关请求失败',
      });
    }
  });
}

export function listenGateway(server: Server, port = 8787): Promise<void> {
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, '127.0.0.1', () => {
      server.off('error', reject);
      resolve();
    });
  });
}
