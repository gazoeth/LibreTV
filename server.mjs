import path from 'path';
import express from 'express';
import axios from 'axios';
import cors from 'cors';
import { fileURLToPath } from 'url';
import fs from 'fs';
import crypto from 'crypto';
import dotenv from 'dotenv';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const config = {
  port: process.env.PORT || 8080,
  password: process.env.PASSWORD || '',
  corsOrigin: process.env.CORS_ORIGIN || '*',
  timeout: parseInt(process.env.REQUEST_TIMEOUT || '5000'),
  maxRetries: parseInt(process.env.MAX_RETRIES || '2'),
  cacheMaxAge: process.env.CACHE_MAX_AGE || '1d',
  userAgent: process.env.USER_AGENT || 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
  debug: process.env.DEBUG === 'true'
};

const log = (...args) => {
  if (config.debug) {
    console.log('[DEBUG]', ...args);
  }
};

const app = express();

app.use(cors({
  origin: config.corsOrigin,
  methods: ['GET', 'POST'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  next();
});

function sha256Hash(input) {
  return new Promise((resolve) => {
    const hash = crypto.createHash('sha256');
    hash.update(input);
    resolve(hash.digest('hex'));
  });
}

function normalizeGeoValue(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function escapeInlineValue(value) {
  return String(value || '').replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

function getHeaderValue(headers, name) {
  const lowerName = name.toLowerCase();
  const rawValue = headers?.[lowerName] ?? headers?.[name] ?? '';
  return normalizeGeoValue(Array.isArray(rawValue) ? rawValue[0] : rawValue);
}

function getClientGeo(headers) {
  const country = (
    getHeaderValue(headers, 'x-vercel-ip-country')
    || getHeaderValue(headers, 'cf-ipcountry')
    || getHeaderValue(headers, 'x-country-code')
    || getHeaderValue(headers, 'x-country')
  ).toUpperCase();
  const region = (
    getHeaderValue(headers, 'x-vercel-ip-country-region')
    || getHeaderValue(headers, 'cf-region-code')
    || getHeaderValue(headers, 'x-region-code')
    || getHeaderValue(headers, 'x-region')
  ).toUpperCase();

  return {
    country,
    region,
    source: country ? 'ip' : ''
  };
}

function buildInlineEnvScript(passwordHash, geo) {
  return [
    `window.__ENV__.PASSWORD = "${escapeInlineValue(passwordHash)}";`,
    `window.__ENV__.GEO_COUNTRY = "${escapeInlineValue(geo.country)}";`,
    `window.__ENV__.GEO_REGION = "${escapeInlineValue(geo.region)}";`,
    `window.__ENV__.GEO_SOURCE = "${escapeInlineValue(geo.source)}";`
  ].join('\n        ');
}

async function renderPage(filePath, password, geo = { country: '', region: '', source: '' }) {
  const passwordHash = password !== '' ? await sha256Hash(password) : '';
  const envScript = buildInlineEnvScript(passwordHash, geo);
  const content = fs.readFileSync(filePath, 'utf8');
  return content.replace('window.__ENV__.PASSWORD = "{{PASSWORD}}";', envScript);
}

app.get(['/', '/index.html', '/player.html'], async (req, res) => {
  try {
    let filePath;
    switch (req.path) {
      case '/player.html':
        filePath = path.join(__dirname, 'player.html');
        break;
      default:
        filePath = path.join(__dirname, 'index.html');
        break;
    }

    const content = await renderPage(filePath, config.password, getClientGeo(req.headers));
    res.send(content);
  } catch (error) {
    console.error('页面渲染错误:', error);
    res.status(500).send('读取静态页面失败');
  }
});

app.get('/s=:keyword', async (req, res) => {
  try {
    const filePath = path.join(__dirname, 'index.html');
    const content = await renderPage(filePath, config.password, getClientGeo(req.headers));
    res.send(content);
  } catch (error) {
    console.error('搜索页面渲染错误:', error);
    res.status(500).send('读取静态页面失败');
  }
});

function isValidUrl(urlString) {
  try {
    const parsed = new URL(urlString);
    const allowedProtocols = ['http:', 'https:'];

    const blockedHostnames = (process.env.BLOCKED_HOSTS || 'localhost,127.0.0.1,0.0.0.0,::1').split(',');
    const blockedPrefixes = (process.env.BLOCKED_IP_PREFIXES || '192.168.,10.,172.').split(',');

    if (!allowedProtocols.includes(parsed.protocol)) return false;
    if (blockedHostnames.includes(parsed.hostname)) return false;

    for (const prefix of blockedPrefixes) {
      if (parsed.hostname.startsWith(prefix)) return false;
    }

    return true;
  } catch {
    return false;
  }
}

function validateProxyAuth(req) {
  const authHash = req.query.auth;
  const timestamp = req.query.t;

  const serverPassword = config.password;
  if (!serverPassword) {
    console.error('服务器未设置 PASSWORD 环境变量，代理访问被拒绝');
    return false;
  }

  const serverPasswordHash = crypto.createHash('sha256').update(serverPassword).digest('hex');

  if (!authHash || authHash !== serverPasswordHash) {
    console.warn('代理请求鉴权失败：密码哈希不匹配');
    console.warn(`期望: ${serverPasswordHash}, 收到: ${authHash}`);
    return false;
  }

  if (timestamp) {
    const now = Date.now();
    const maxAge = 10 * 60 * 1000;
    if (now - parseInt(timestamp, 10) > maxAge) {
      console.warn('代理请求鉴权失败：时间戳过期');
      return false;
    }
  }

  return true;
}

app.get('/proxy/:encodedUrl', async (req, res) => {
  try {
    if (!validateProxyAuth(req)) {
      return res.status(401).json({
        success: false,
        error: '代理访问未授权：请检查密码配置或鉴权参数'
      });
    }

    const encodedUrl = req.params.encodedUrl;
    const targetUrl = decodeURIComponent(encodedUrl);

    if (!isValidUrl(targetUrl)) {
      return res.status(400).send('无效的 URL');
    }

    log(`代理请求: ${targetUrl}`);

    const maxRetries = config.maxRetries;
    let retries = 0;

    const makeRequest = async () => {
      try {
        return await axios({
          method: 'get',
          url: targetUrl,
          responseType: 'stream',
          timeout: config.timeout,
          headers: {
            'User-Agent': config.userAgent
          }
        });
      } catch (error) {
        if (retries < maxRetries) {
          retries++;
          log(`重试请求 (${retries}/${maxRetries}): ${targetUrl}`);
          return makeRequest();
        }
        throw error;
      }
    };

    const response = await makeRequest();
    const headers = { ...response.headers };
    const sensitiveHeaders = (
      process.env.FILTERED_HEADERS
      || 'content-security-policy,cookie,set-cookie,x-frame-options,access-control-allow-origin'
    ).split(',');

    sensitiveHeaders.forEach(header => delete headers[header]);
    res.set(headers);
    response.data.pipe(res);
  } catch (error) {
    console.error('代理请求错误:', error.message);
    if (error.response) {
      res.status(error.response.status || 500);
      error.response.data.pipe(res);
    } else {
      res.status(500).send(`请求失败: ${error.message}`);
    }
  }
});

app.use(express.static(path.join(__dirname), {
  maxAge: config.cacheMaxAge
}));

app.use((err, req, res, next) => {
  console.error('服务器错误:', err);
  res.status(500).send('服务器内部错误');
});

app.use((req, res) => {
  res.status(404).send('页面未找到');
});

app.listen(config.port, () => {
  console.log(`服务器运行在 http://localhost:${config.port}`);
  if (config.password !== '') {
    console.log('用户登录密码已设置');
  } else {
    console.log('警告: 未设置 PASSWORD 环境变量，用户将被要求设置密码');
  }
  if (config.debug) {
    console.log('调试模式已启用');
    console.log('配置:', { ...config, password: config.password ? '******' : '' });
  }
});
