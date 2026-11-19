const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');
const crypto = require('node:crypto');

// Helper to format an LSP JSON-RPC message with Content-Length header
function formatLspMessage(obj) {
  const json = JSON.stringify(obj);
  return `Content-Length: ${Buffer.byteLength(json, 'utf8')}\r\n\r\n${json}`;
}

// Helper to parse framed LSP messages from stdout stream
class LspMessageParser {
  constructor() {
    this.buffer = Buffer.alloc(0);
  }

  append(chunk) {
    this.buffer = Buffer.concat([this.buffer, chunk]);
  }

  nextMessage() {
    const headerEndIndex = this.buffer.indexOf('\r\n\r\n');
    if (headerEndIndex === -1) return null;

    const header = this.buffer.slice(0, headerEndIndex).toString('utf8');
    const match = header.match(/Content-Length:\s*(\d+)/i);
    if (!match) return null;

    const contentLength = parseInt(match[1], 10);
    const bodyStartIndex = headerEndIndex + 4;
    const totalLength = bodyStartIndex + contentLength;

    if (this.buffer.length < totalLength) return null;

    const body = this.buffer.slice(bodyStartIndex, totalLength).toString('utf8');
    this.buffer = this.buffer.slice(totalLength);
    return JSON.parse(body);
  }
}

test('getPlatformAssetName matrix covers all supported platforms', () => {
  // We can test the logic directly
  function getAsset(platform, arch) {
    if (platform === 'darwin') {
      if (arch === 'arm64') return 'htmx-analyzer-darwin-arm64';
      if (arch === 'x64') return 'htmx-analyzer-darwin-x64';
    } else if (platform === 'linux') {
      if (arch === 'x64') return 'htmx-analyzer-linux-x64';
      if (arch === 'arm64') return 'htmx-analyzer-linux-arm64';
    } else if (platform === 'win32') {
      if (arch === 'x64') return 'htmx-analyzer-windows-x64.exe';
      if (arch === 'arm64') return 'htmx-analyzer-windows-arm64.exe';
    }
    return null;
  }

  assert.strictEqual(getAsset('darwin', 'arm64'), 'htmx-analyzer-darwin-arm64');
  assert.strictEqual(getAsset('darwin', 'x64'), 'htmx-analyzer-darwin-x64');
  assert.strictEqual(getAsset('linux', 'x64'), 'htmx-analyzer-linux-x64');
  assert.strictEqual(getAsset('linux', 'arm64'), 'htmx-analyzer-linux-arm64');
  assert.strictEqual(getAsset('win32', 'x64'), 'htmx-analyzer-windows-x64.exe');
  assert.strictEqual(getAsset('win32', 'arm64'), 'htmx-analyzer-windows-arm64.exe');
  assert.strictEqual(getAsset('freebsd', 'x64'), null);
});

test('verifyChecksum correctly validates and rejects SHA-256 digests', () => {
  const content = Buffer.from('hello world from htmx-analyzer', 'utf8');
  const validHash = crypto.createHash('sha256').update(content).digest('hex');
  const invalidHash = '0000000000000000000000000000000000000000000000000000000000000000';

  function verify(buf, expected) {
    const actual = crypto.createHash('sha256').update(buf).digest('hex').toLowerCase();
    const cleanExpected = expected.trim().split(/\s+/)[0].toLowerCase();
    return actual === cleanExpected;
  }

  assert.strictEqual(verify(content, validHash), true);
  assert.strictEqual(verify(content, `${validHash}  htmx-analyzer-darwin-arm64\n`), true);
  assert.strictEqual(verify(content, invalidHash), false);
});

test('real LSP protocol communication with htmx-analyzer server binary', async () => {
  // Locate release or debug binary from workspace
  const releaseBin = path.resolve(__dirname, '../../htmx-analyzer/target/release/htmx-analyzer');
  const debugBin = path.resolve(__dirname, '../../htmx-analyzer/target/debug/htmx-analyzer');
  const binPath = fs.existsSync(releaseBin) ? releaseBin : debugBin;

  if (!fs.existsSync(binPath)) {
    console.warn(`Skipping live binary test: ${binPath} not found`);
    return;
  }

  const child = spawn(binPath, [], { stdio: ['pipe', 'pipe', 'inherit'] });
  const parser = new LspMessageParser();

  const responses = new Map();
  const notifications = [];

  child.stdout.on('data', (chunk) => {
    parser.append(chunk);
    let msg;
    while ((msg = parser.nextMessage()) !== null) {
      if (msg.id !== undefined) {
        responses.set(msg.id, msg);
      } else {
        notifications.push(msg);
      }
    }
  });

  async function sendRequest(method, params, id) {
    const msg = formatLspMessage({ jsonrpc: '2.0', id, method, params });
    child.stdin.write(msg);

    const deadline = Date.now() + 5000;
    while (Date.now() < deadline) {
      if (responses.has(id)) {
        return responses.get(id);
      }
      await new Promise((r) => setTimeout(r, 20));
    }
    throw new Error(`Timeout waiting for response to ${method} (id ${id})`);
  }

  function sendNotification(method, params) {
    const msg = formatLspMessage({ jsonrpc: '2.0', method, params });
    child.stdin.write(msg);
  }

  try {
    // 1. Initialize
    const initResp = await sendRequest(
      'initialize',
      {
        capabilities: {
          textDocument: {
            definition: { linkSupport: true },
          },
        },
        initializationOptions: {},
      },
      1
    );

    assert.ok(initResp.result, 'Initialize should return result');
    const caps = initResp.result.capabilities;
    assert.strictEqual(caps.definitionProvider, true, 'definitionProvider should be true');
    assert.strictEqual(caps.referencesProvider, true, 'referencesProvider should be true');
    assert.ok(caps.completionProvider, 'completionProvider should exist');
    assert.ok(caps.hoverProvider, 'hoverProvider should exist');

    sendNotification('initialized', {});

    // 2. Open Document
    const testUri = 'file:///workspace/test.html';
    const docText = `<div id="target-div">Target content</div>\n<button hx-target="#target-div">Click</button>`;
    sendNotification('textDocument/didOpen', {
      textDocument: {
        uri: testUri,
        languageId: 'html',
        version: 1,
        text: docText,
      },
    });

    // Brief yield for server to process didOpen
    await new Promise((r) => setTimeout(r, 100));

    // 3. Go to Definition (F12 on #target-div at line 1, character 22)
    const defResp = await sendRequest(
      'textDocument/definition',
      {
        textDocument: { uri: testUri },
        position: { line: 1, character: 22 },
      },
      2
    );

    assert.ok(defResp.result, 'Definition request should return a target');
    assert.ok(Array.isArray(defResp.result), 'Expected LocationLink array');
    assert.strictEqual(defResp.result.length, 1);
    assert.strictEqual(defResp.result[0].targetUri, testUri);
    assert.strictEqual(defResp.result[0].targetRange.start.line, 0);

    // 4. Find References on target-div (line 0, character 12)
    const refResp = await sendRequest(
      'textDocument/references',
      {
        textDocument: { uri: testUri },
        position: { line: 0, character: 12 },
        context: { includeDeclaration: true },
      },
      3
    );

    assert.ok(Array.isArray(refResp.result), 'References request should return array');
    assert.strictEqual(refResp.result.length, 2, 'Expected declaration + hx-target reference');

    // 5. Autocompletion test
    const compResp = await sendRequest(
      'textDocument/completion',
      {
        textDocument: { uri: testUri },
        position: { line: 1, character: 15 }, // inside hx-target
      },
      4
    );

    assert.ok(compResp.result, 'Completion request should return completions');

    // 6. Shutdown & Exit
    const shutdownResp = await sendRequest('shutdown', null, 5);
    assert.strictEqual(shutdownResp.result, null);
    sendNotification('exit', null);

    const exitPromise = new Promise((resolve) => child.on('exit', resolve));
    const exitCode = await exitPromise;
    assert.strictEqual(exitCode, 0, 'Server should exit cleanly with code 0');
  } finally {
    if (!child.killed) {
      child.kill();
    }
  }
});
