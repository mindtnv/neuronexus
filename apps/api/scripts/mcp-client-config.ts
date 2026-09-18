import { readFileSync, statSync } from 'node:fs';

/** Shared by smoke check and stdio bridge. Never print the returned headers. */
export function mcpClientConfig() {
  const endpoint = process.env.NEURONEXUS_MCP_URL;
  if (!endpoint) throw new Error('Set NEURONEXUS_MCP_URL to the API /mcp endpoint.');
  let url: URL;
  try { url = new URL(endpoint); } catch { throw new Error('NEURONEXUS_MCP_URL must be a valid URL.'); }
  if (url.username || url.password || url.search || url.hash) throw new Error('The MCP URL must not contain credentials, query parameters or fragments.');
  if (url.protocol !== 'https:' && !(url.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)))
    throw new Error('Use HTTPS for remote MCP connections. Plain HTTP is limited to loopback.');
  let token = process.env.NEURONEXUS_MCP_TOKEN;
  const tokenFile = process.env.NEURONEXUS_MCP_TOKEN_FILE;
  if (!token && tokenFile) {
    const stat = statSync(tokenFile);
    if (process.platform !== 'win32' && (stat.mode & 0o077) !== 0) throw new Error('The token file must be private: chmod 600 <token-file>.');
    token = readFileSync(tokenFile, 'utf8').trim();
  }
  if (!token || !/^nn_pat_[A-Za-z0-9_-]{43}$/.test(token)) throw new Error('Set NEURONEXUS_MCP_TOKEN or NEURONEXUS_MCP_TOKEN_FILE to a valid personal token.');
  return { url, headers: { Authorization: `Bearer ${token}` } };
}
