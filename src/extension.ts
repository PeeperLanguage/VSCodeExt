import { exec } from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as vscode from 'vscode';
import { workspace, ExtensionContext } from 'vscode';

import {
  LanguageClient,
  LanguageClientOptions,
  ServerOptions,
} from 'vscode-languageclient/node';

const DOWNLOAD_URL = 'https://github.com/PeeperLanguage/compiler/releases/latest';

let client: LanguageClient | undefined;

const output = vscode.window.createOutputChannel('Peeper', { log: true });

function configuredServerPath(): string {
  return workspace.getConfiguration('peeper.server').get<string>('path', '').trim();
}

function binaryExists(command: string): Promise<boolean> {
  const probe = process.platform === 'win32' ? `where ${command}` : `command -v ${command}`;
  return new Promise((resolve) => {
    exec(probe, (error) => resolve(!error));
  });
}

// GUI-launched (especially sandboxed/Flatpak) editors often have a PATH that
// misses user install locations, so probe those explicitly as a fallback.
// Install locations per docs/distribution.md: ~/.peeper on Unix,
// %LOCALAPPDATA%\Peeper on Windows.
function commonBinaryLocations(): string[] {
  const home = os.homedir();
  const exe = process.platform === 'win32' ? 'peeper.exe' : 'peeper';
  const localAppData = process.env.LOCALAPPDATA;
  const candidates = [
    path.join(home, '.peeper', 'bin', exe),
    path.join(home, '.local', 'bin', exe),
    path.join('/usr/local/bin', exe),
    path.join('/usr/bin', exe),
  ];
  if (localAppData) {
    candidates.unshift(path.join(localAppData, 'Peeper', 'bin', exe));
  }
  return candidates;
}

async function resolveServerCommand(): Promise<string | undefined> {
  const configured = configuredServerPath();
  if (configured) {
    return (await binaryExists(configured)) ? configured : undefined;
  }
  if (await binaryExists('peeper')) {
    return 'peeper';
  }
  const found = commonBinaryLocations().find((p) => {
    try {
      fs.accessSync(p, fs.constants.X_OK);
      return true;
    } catch {
      return false;
    }
  });
  return found;
}

function promptInstallCompiler(): void {
  vscode.window
    .showInformationMessage(
      'The Peeper compiler (`peeper`) was not found. Syntax highlighting is active, but hover, go to definition, completion and diagnostics need the compiler.',
      'Install Peeper',
      'Ignore',
    )
    .then((choice) => {
      if (choice === 'Install Peeper') {
        vscode.env.openExternal(vscode.Uri.parse(DOWNLOAD_URL));
      }
    });
}

export async function activate(context: ExtensionContext) {
  output.info('Peeper extension activating');
  context.subscriptions.push(output,
    vscode.commands.registerCommand('peeper.restartServer', async () => {
      if (!client) {
        promptInstallCompiler();
        return;
      }
      await client.stop();
      await client.start();
    }),
    vscode.workspace.onDidChangeConfiguration(async (e) => {
      if (!e.affectsConfiguration('peeper.server.path')) {
        return;
      }
      if (client) {
        await client.stop();
        client = undefined;
      }
      await tryStartClient(context);
    }),
  );

  await tryStartClient(context);
}

async function tryStartClient(context: ExtensionContext): Promise<void> {
  const command = await resolveServerCommand();
  output.info(`peeper binary resolution: ${command ?? 'not found'}`);
  if (!command) {
    promptInstallCompiler();
    return;
  }

  // NOTE: do not set transport: TransportKind.stdio here — for Executable
  // servers the client then appends a `--stdio` argument, which `peeper lsp`
  // rejects (it takes no arguments). Omitting transport still uses stdio.
  const serverOptions: ServerOptions = {
    run: { command, args: ['lsp'] },
    debug: { command, args: ['lsp'] },
  };

  const clientOptions: LanguageClientOptions = {
    documentSelector: [{ scheme: 'file', language: 'peeper' }],
    synchronize: {
      fileEvents: workspace.createFileSystemWatcher('**/*.peep'),
    },
    traceOutputChannel: vscode.window.createOutputChannel('Peeper Language Server'),
  };

  client = new LanguageClient(
    'peeperLanguageServer',
    'Peeper Language Server',
    serverOptions,
    clientOptions,
  );
  context.subscriptions.push(client);
  try {
    await client.start();
    output.info('Peeper language server started');
  } catch (err) {
    client = undefined;
    output.error(`Peeper language server failed to start: ${err}`);
    void vscode.window.showErrorMessage(
      `Peeper language server failed to start: ${err}`,
    );
  }
}

export async function deactivate(): Promise<void> {
  if (!client) {
    return;
  }
  await client.stop();
  client = undefined;
}
