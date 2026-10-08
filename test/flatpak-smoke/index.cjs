const vscode = require('vscode');
const fs = require('node:fs');
const path = require('node:path');
exports.run = async () => {
  const root = path.resolve(__dirname, '../..');
  const results = path.join(root, '.test-artifacts');
  fs.mkdirSync(results, { recursive: true });
  fs.rmSync(path.join(results, 'done'), { force: true });
  const extension = vscode.extensions.getExtension('merlin-local.merlin-companion');
  if (!extension) throw Error('Development extension not found');
  await extension.activate();
  await vscode.workspace.getConfiguration('merlin').update('diagnosticReactions', false, vscode.ConfigurationTarget.Global);
  const document = await vscode.workspace.openTextDocument({ language: 'typescript', content: Array.from({ length: 70 }, (_, n) => `const fixtureLine${n} = "Typing and selecting must still work under Merlin";`).map((line, n) => n === 3 ? `const spellingMistake = 'magic'.toUppercase();` : line).join('\n') });
  await vscode.window.showTextDocument(document);
  await vscode.commands.executeCommand('workbench.action.focusActiveEditorGroup');
  await new Promise(resolve => setTimeout(resolve, 1200));
  const diagnosticsDeadline = Date.now() + 20000;
  while (!vscode.languages.getDiagnostics(document.uri).some(d => d.message.includes('toUppercase')) && Date.now() < diagnosticsDeadline) await new Promise(resolve => setTimeout(resolve, 200));
  // Leave automatic movement running; the verifier must observe it before pausing.
  fs.writeFileSync(path.join(results, 'ready.json'), JSON.stringify({ focused: vscode.window.state.focused, version: vscode.version, flatpak: process.env.FLATPAK_ID || '', display: process.env.DISPLAY || '' }));
  // Keep this isolated development window open for DOM/rendering verification.
  const timeout = Date.now() + 300000;
  while (!fs.existsSync(path.join(results, 'done')) && Date.now() < timeout) {
    const action = path.join(results, 'action.json');
    if (fs.existsSync(action)) {
      const request = JSON.parse(fs.readFileSync(action, 'utf8')); fs.unlinkSync(action);
      if (request.command) await vscode.commands.executeCommand(request.command);
      const editor = vscode.window.activeTextEditor;
      fs.writeFileSync(path.join(results, 'action-result.json'), JSON.stringify({ id: request.id,
        text: editor?.document.getText(), selection: editor?.selection, focused: vscode.window.state.focused,
        voiceEnabled: vscode.workspace.getConfiguration('merlin').get('voice.enabled', true),
        speechProcesses: fs.readdirSync('/proc').filter(name => /^\d+$/.test(name)).flatMap(pid => {
          try { const exe = fs.readlinkSync('/proc/' + pid + '/exe'); return exe.startsWith(path.join(extension.extensionPath, 'companion/speech')) ? [{ pid, exe }] : []; } catch { return []; }
        }) }));
    }
    await new Promise(resolve => setTimeout(resolve, 100));
  }
};
