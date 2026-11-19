import * as vscode from 'vscode';
import { LanguageClient } from 'vscode-languageclient/node';
import { createLanguageClient } from './client';
import { downloadServerBinary, resolveServerBinary } from './server';

let client: LanguageClient | undefined;

export async function activate(context: vscode.ExtensionContext): Promise<void> {
  const config = vscode.workspace.getConfiguration('htmx');
  if (!config.get<boolean>('enable', true)) {
    return;
  }

  async function startClient(): Promise<void> {
    try {
      const binaryInfo = await resolveServerBinary(context);
      client = createLanguageClient(context, binaryInfo.command);
      await client.start();
    } catch (err: any) {
      vscode.window
        .showErrorMessage(
          `HTMX: Failed to start language server: ${err?.message || err}`,
          'Retry',
          'Configure Path'
        )
        .then((choice) => {
          if (choice === 'Retry') {
            startClient();
          } else if (choice === 'Configure Path') {
            vscode.commands.executeCommand(
              'workbench.action.openSettings',
              'htmx.server.path'
            );
          }
        });
    }
  }

  async function restartClient(): Promise<void> {
    if (client) {
      await client.stop();
      client = undefined;
    }
    await startClient();
  }

  // Register commands
  context.subscriptions.push(
    vscode.commands.registerCommand('htmx.restartServer', async () => {
      vscode.window.showInformationMessage('HTMX: Restarting language server...');
      await restartClient();
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('htmx.downloadServer', async () => {
      try {
        await downloadServerBinary(context, true);
        await restartClient();
      } catch (err: any) {
        vscode.window.showErrorMessage(
          `HTMX: Failed to download server binary: ${err?.message || err}`
        );
      }
    })
  );

  // Watch configuration updates
  context.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration(async (event) => {
      if (
        event.affectsConfiguration('htmx.server.path') ||
        event.affectsConfiguration('htmx.enable') ||
        event.affectsConfiguration('htmx.diagnostics')
      ) {
        const enabled = vscode.workspace
          .getConfiguration('htmx')
          .get<boolean>('enable', true);

        if (!enabled && client) {
          await client.stop();
          client = undefined;
        } else if (enabled) {
          await restartClient();
        }
      }
    })
  );

  await startClient();
}

export async function deactivate(): Promise<void> {
  if (client) {
    await client.stop();
    client = undefined;
  }
}
