import * as vscode from 'vscode';
import { MerlinViewProvider } from './merlinViewProvider';
import { CompanionConnection } from './companionConnection';
export function activate(context: vscode.ExtensionContext) {
    const companion = new CompanionConnection(context.extensionUri);
    const provider = new MerlinViewProvider(context.extensionUri, companion);
    context.subscriptions.push(companion, provider,
        vscode.window.registerWebviewViewProvider('merlin.companion', provider, { webviewOptions: { retainContextWhenHidden: true } }));
    for (const action of ['show', 'pause', 'magic', 'speak', 'dismiss', 'testVoice', 'explainError'])
        context.subscriptions.push(vscode.commands.registerCommand('merlin.' + action, () => provider.command(action)));
    void companion.start(true);
    const commands: Record<string, () => unknown> = {
        startCompanion: () => companion.start(), stopCompanion: () => companion.stop(),
        toggleOverlay: () => companion.toggle(), companionStatus: () => companion.showStatus(),
        selectVoice: () => provider.selectVoice(),
        toggleVoice: () => {
            const config = vscode.workspace.getConfiguration('merlin');
            return config.update('voice.enabled', !config.get('voice.enabled', true), vscode.ConfigurationTarget.Global);
        }
    };
    for (const [name, action] of Object.entries(commands))
        context.subscriptions.push(vscode.commands.registerCommand('merlin.' + name, action));
}
export function deactivate() {}
