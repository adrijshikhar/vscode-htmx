import * as vscode from 'vscode';
import {
  LanguageClient,
  LanguageClientOptions,
  ServerOptions,
  TransportKind,
} from 'vscode-languageclient/node';

export const SUPPORTED_LANGUAGES = [
  'html',
  'htmldjango',
  'jinja',
  'jinja-html',
  'php',
  'blade',
  'erb',
  'astro',
  'svelte',
  'vue',
  'templ',
];

export function createLanguageClient(
  context: vscode.ExtensionContext,
  binaryPath: string
): LanguageClient {
  const serverOptions: ServerOptions = {
    run: {
      command: binaryPath,
      transport: TransportKind.stdio,
    },
    debug: {
      command: binaryPath,
      transport: TransportKind.stdio,
    },
  };

  const documentSelector = SUPPORTED_LANGUAGES.flatMap((lang) => [
    { scheme: 'file', language: lang },
    { scheme: 'untitled', language: lang },
  ]);

  const config = vscode.workspace.getConfiguration('htmx');

  const clientOptions: LanguageClientOptions = {
    documentSelector,
    synchronize: {
      configurationSection: 'htmx',
      fileEvents: vscode.workspace.createFileSystemWatcher(
        '**/*.{html,htm,jinja,jinja2,j2,blade.php,templ,erb,hbs,liquid,twig}'
      ),
    },
    initializationOptions: {
      diagnostics: {
        enable: config.get<boolean>('diagnostics.enable', true),
        severity: config.get<Record<string, string>>('diagnostics.severity', {}),
      },
    },
    outputChannelName: 'HTMX Language Server',
  };

  return new LanguageClient(
    'htmx-analyzer',
    'HTMX Language Server',
    serverOptions,
    clientOptions
  );
}
