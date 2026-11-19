import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import * as https from 'https';
import { execSync } from 'child_process';

const GITHUB_REPO = 'adrijshikhar/htmx-analyzer';

export interface BinaryInfo {
  command: string;
  source: 'config' | 'path' | 'download' | 'cached';
  version?: string;
}

export function getPlatformAssetName(): string | null {
  const platform = process.platform;
  const arch = process.arch;

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

function findOnPath(binaryName: string): string | null {
  const pathEnv = process.env.PATH || '';
  const delimiter = process.platform === 'win32' ? ';' : ':';
  const dirs = pathEnv.split(delimiter);
  const extensions = process.platform === 'win32' ? ['.exe', '.cmd', '.bat', ''] : [''];

  for (const dir of dirs) {
    for (const ext of extensions) {
      const fullPath = path.join(dir, binaryName + ext);
      try {
        if (fs.existsSync(fullPath) && fs.statSync(fullPath).isFile()) {
          return fullPath;
        }
      } catch {
        // ignore permission or access errors during scan
      }
    }
  }

  return null;
}

function httpsGet(url: string, headers: Record<string, string> = {}): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const defaultHeaders = {
      'User-Agent': 'vscode-htmx',
      ...headers,
    };

    https.get(url, { headers: defaultHeaders }, (res) => {
      // Follow redirects (GitHub Releases redirect downloads to S3 / AWS)
      if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        httpsGet(res.headers.location, headers).then(resolve, reject);
        return;
      }

      if (res.statusCode !== 200) {
        reject(new Error(`HTTP ${res.statusCode}: ${res.statusMessage || 'Request failed'}`));
        return;
      }

      const chunks: Buffer[] = [];
      res.on('data', (chunk) => chunks.push(Buffer.from(chunk)));
      res.on('end', () => resolve(Buffer.concat(chunks)));
      res.on('error', reject);
    }).on('error', reject);
  });
}

export async function downloadServerBinary(
  context: vscode.ExtensionContext,
  force: boolean = false
): Promise<string> {
  const assetName = getPlatformAssetName();
  if (!assetName) {
    throw new Error(
      `Unsupported platform ${process.platform}-${process.arch}. Please build or install htmx-analyzer manually and configure 'htmx.server.path'.`
    );
  }

  const storageDir = context.globalStorageUri.fsPath;
  const binDir = path.join(storageDir, 'bin');
  const targetBinaryName = process.platform === 'win32' ? 'htmx-analyzer.exe' : 'htmx-analyzer';
  const targetPath = path.join(binDir, targetBinaryName);

  if (!fs.existsSync(binDir)) {
    fs.mkdirSync(binDir, { recursive: true });
  }

  if (!force && fs.existsSync(targetPath)) {
    return targetPath;
  }

  return await vscode.window.withProgress(
    {
      location: vscode.ProgressLocation.Notification,
      title: 'HTMX: Downloading language server...',
      cancellable: false,
    },
    async (progress) => {
      progress.report({ message: 'Fetching release metadata...' });

      const releaseUrl = `https://api.github.com/repos/${GITHUB_REPO}/releases/latest`;
      const releaseJson = await httpsGet(releaseUrl, {
        Accept: 'application/vnd.github.v3+json',
      });
      const release = JSON.parse(releaseJson.toString('utf-8'));

      const binaryAsset = release.assets.find((a: any) => a.name === assetName);
      if (!binaryAsset) {
        throw new Error(
          `Could not find release binary '${assetName}' in release ${release.tag_name}.`
        );
      }

      const sha256Asset = release.assets.find((a: any) => a.name === `${assetName}.sha256`);

      progress.report({ message: `Downloading ${assetName}...` });
      const binaryBuffer = await httpsGet(binaryAsset.browser_download_url);

      if (sha256Asset) {
        progress.report({ message: 'Verifying checksum...' });
        const sha256Buffer = await httpsGet(sha256Asset.browser_download_url);
        const expectedSha = sha256Buffer.toString('utf-8').trim().split(/\s+/)[0].toLowerCase();
        const actualSha = crypto.createHash('sha256').update(binaryBuffer).digest('hex').toLowerCase();

        if (expectedSha !== actualSha) {
          throw new Error(
            `SHA-256 verification failed for ${assetName}.\nExpected: ${expectedSha}\nActual:   ${actualSha}`
          );
        }
      }

      progress.report({ message: 'Installing binary...' });
      fs.writeFileSync(targetPath, binaryBuffer);

      if (process.platform !== 'win32') {
        fs.chmodSync(targetPath, 0o755);
      }

      vscode.window.showInformationMessage(
        `HTMX: Language server (${release.tag_name}) installed successfully.`
      );

      return targetPath;
    }
  );
}

export async function resolveServerBinary(
  context: vscode.ExtensionContext
): Promise<BinaryInfo> {
  const config = vscode.workspace.getConfiguration('htmx');
  const customPath = config.get<string>('server.path');

  // 1. User-configured custom path
  if (customPath && customPath.trim().length > 0) {
    const resolvedPath = path.isAbsolute(customPath)
      ? customPath
      : path.resolve(vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || '', customPath);

    if (fs.existsSync(resolvedPath)) {
      return { command: resolvedPath, source: 'config' };
    }
    vscode.window.showWarningMessage(
      `HTMX: Configured server path '${customPath}' does not exist. Falling back to PATH / download.`
    );
  }

  // 2. Check system PATH
  const pathBinary = findOnPath('htmx-analyzer') || findOnPath('htmx-lsp');
  if (pathBinary) {
    return { command: pathBinary, source: 'path' };
  }

  // 3. Check previously downloaded cached binary
  const storageDir = context.globalStorageUri.fsPath;
  const targetBinaryName = process.platform === 'win32' ? 'htmx-analyzer.exe' : 'htmx-analyzer';
  const cachedPath = path.join(storageDir, 'bin', targetBinaryName);

  if (fs.existsSync(cachedPath)) {
    try {
      if (process.platform !== 'win32') {
        fs.chmodSync(cachedPath, 0o755);
      }
      return { command: cachedPath, source: 'cached' };
    } catch {
      // ignore and download fresh
    }
  }

  // 4. Download latest binary from GitHub Releases
  const downloadedPath = await downloadServerBinary(context);
  return { command: downloadedPath, source: 'download' };
}
