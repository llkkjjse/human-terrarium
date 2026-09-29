import type { AddressInfo } from 'node:net';
import { afterEach, describe, expect, test, vi } from 'vitest';
import { createGateway, listenGateway } from '../../server/http';

const usage = {
  model: 'deepseek-flash',
  inputTokens: 10,
  outputTokens: 5,
  durationMs: 20,
  estimatedCost: 0.0001,
};

function fakeService() {
  return {
    generateWorld: vi.fn(async () => ({ data: { generated: true }, usage })),
    compilePolicy: vi.fn(async () => ({ data: { compiled: true }, usage })),
    parseAbsoluteEvent: vi.fn(async () => ({ data: { parsed: true }, usage })),
    runFrame: vi.fn(async () => ({ data: { framed: true }, usage })),
  };
}

async function post(base: string, path: string, body: unknown): Promise<Response> {
  return fetch(`${base}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('loopback AI gateway', () => {
  const servers: Array<ReturnType<typeof createGateway>> = [];
  afterEach(async () => Promise.all(servers.map((server) => new Promise<void>((resolve) => server.close(() => resolve())))));

  test('binds only to loopback and routes all four endpoints', async () => {
    const service = fakeService();
    const server = createGateway({ service });
    servers.push(server);
    await listenGateway(server, 0);
    const address = server.address() as AddressInfo;
    expect(address.address).toBe('127.0.0.1');
    const base = `http://127.0.0.1:${address.port}`;

    for (const [path, method] of [
      ['/api/world/generate', 'generateWorld'],
      ['/api/policy/compile', 'compilePolicy'],
      ['/api/event/parse', 'parseAbsoluteEvent'],
      ['/api/frame/run', 'runFrame'],
    ] as const) {
      const response = await post(base, path, { text: '有效内容' });
      expect(response.status).toBe(200);
      expect((await response.json()).usage.model).toBe('deepseek-flash');
      expect(service[method]).toHaveBeenCalledOnce();
    }
  });

  test('rejects oversized bodies and oversized natural-language fields', async () => {
    const service = fakeService();
    const server = createGateway({ service, maxBodyBytes: 128, maxTextLength: 20 });
    servers.push(server);
    await listenGateway(server, 0);
    const address = server.address() as AddressInfo;
    const base = `http://127.0.0.1:${address.port}`;

    const oversizedBody = await post(base, '/api/policy/compile', { text: 'x'.repeat(200) });
    expect(oversizedBody.status).toBe(413);

    const oversizedText = await post(base, '/api/policy/compile', { text: '这是一段明显超过二十个字符的自然语言政策内容' });
    expect(oversizedText.status).toBe(400);
    expect(service.compilePolicy).not.toHaveBeenCalled();
  });

  test('redacts sensitive upstream errors', async () => {
    const service = fakeService();
    service.runFrame.mockRejectedValueOnce(new Error('upstream rejected sk-private-key'));
    const server = createGateway({ service, sensitiveValues: ['sk-private-key'] });
    servers.push(server);
    await listenGateway(server, 0);
    const address = server.address() as AddressInfo;

    const response = await post(`http://127.0.0.1:${address.port}`, '/api/frame/run', { text: 'run' });
    const body = await response.text();

    expect(response.status).toBe(502);
    expect(body).not.toContain('sk-private-key');
    expect(body).toContain('AI 网关请求失败');
  });
});
