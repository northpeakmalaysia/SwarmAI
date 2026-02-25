/**
 * AI Provider Scanner for Local Agent
 *
 * Auto-discovers local AI services (Ollama, LM Studio) on the user's machine.
 * Reports available providers and models to the SwarmAI server so they can be
 * used as AI providers via Task Routing.
 */

const http = require('http');

const SCAN_TIMEOUT_MS = 3000; // 3s per service

/**
 * Known local AI service endpoints to scan
 */
const AI_SERVICES = [
  {
    type: 'ollama',
    baseUrl: 'http://localhost:11434',
    modelsPath: '/api/tags',
    parseModels: (data) => {
      // Ollama /api/tags returns { models: [{ name, size, details: { parameter_size, ... } }] }
      if (!data || !data.models) return [];
      return data.models.map(m => ({
        id: m.name,
        name: m.name,
        size: m.size ? `${(m.size / (1024 * 1024 * 1024)).toFixed(1)}GB` : null,
        parameterSize: m.details?.parameter_size || null,
        family: m.details?.family || null,
        quantization: m.details?.quantization_level || null,
      }));
    },
  },
  {
    type: 'lmstudio',
    baseUrl: 'http://localhost:1234',
    modelsPath: '/v1/models',
    parseModels: (data) => {
      // LM Studio OpenAI-compatible: { data: [{ id, object, owned_by }] }
      if (!data || !data.data) return [];
      return data.data.map(m => ({
        id: m.id,
        name: m.id,
        ownedBy: m.owned_by || null,
      }));
    },
  },
];

/**
 * Make a GET request with timeout (uses Node.js built-in http module)
 */
function httpGet(urlStr, timeoutMs) {
  return new Promise((resolve) => {
    try {
      const url = new URL(urlStr);
      const req = http.request({
        hostname: url.hostname,
        port: url.port,
        path: url.pathname,
        method: 'GET',
        timeout: timeoutMs,
      }, (res) => {
        let data = '';
        res.on('data', (chunk) => { data += chunk; });
        res.on('end', () => {
          try { resolve(JSON.parse(data)); } catch { resolve(null); }
        });
      });

      req.on('error', () => resolve(null));
      req.on('timeout', () => { req.destroy(); resolve(null); });
      req.end();
    } catch {
      resolve(null);
    }
  });
}

/**
 * Scan for all known local AI services.
 * Returns array of discovered providers with their models.
 * Non-blocking — services that are down are silently skipped.
 *
 * @returns {Promise<Array<{ type: string, baseUrl: string, models: Array }>>}
 */
async function scanAiProviders() {
  const results = [];

  // Scan all services in parallel
  const scans = AI_SERVICES.map(async (service) => {
    const url = `${service.baseUrl}${service.modelsPath}`;
    const data = await httpGet(url, SCAN_TIMEOUT_MS);

    if (!data) return null;

    const models = service.parseModels(data);
    if (models.length === 0) return null;

    return {
      type: service.type,
      baseUrl: service.baseUrl,
      models,
    };
  });

  const scanResults = await Promise.all(scans);
  for (const result of scanResults) {
    if (result) results.push(result);
  }

  return results;
}

module.exports = { scanAiProviders, AI_SERVICES };
