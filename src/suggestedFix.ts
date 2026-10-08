import * as vscode from 'vscode';
const shorten = (text: string, limit: number) => {
    const clean = text.replace(/\s+/g, ' ').trim();
    return clean.length > limit ? clean.slice(0, limit - 1) + '…' : clean;
};
export async function diagnosticExplanation(document: vscode.TextDocument, diagnostic: vscode.Diagnostic): Promise<string> {
    const source = diagnostic.source ? `${shorten(diagnostic.source, 40)}: ` : '';
    const problem = `Line ${diagnostic.range.start.line + 1}. ${source}${shorten(diagnostic.message, 260)}`;
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
        const actions = await Promise.race([
            vscode.commands.executeCommand<(vscode.CodeAction | vscode.Command)[]>(
                'vscode.executeCodeActionProvider', document.uri, diagnostic.range, 'quickfix', 8),
            new Promise<undefined>(resolve => { timer = setTimeout(() => resolve(undefined), 1500); })
        ]);
        if (!actions) return `${problem} Quick fixes are not available yet. Try Read Suggested Fix again.`;
        const candidates = actions.filter(action => {
            if ('disabled' in action && action.disabled) return false;
            if ('kind' in action && action.kind && !vscode.CodeActionKind.QuickFix.contains(action.kind)) return false;
            if ('diagnostics' in action && action.diagnostics?.length) return action.diagnostics.some(issue =>
                issue.message === diagnostic.message && issue.range.start.line === diagnostic.range.start.line);
            return true;
        }).sort((a, b) => Number('isPreferred' in b && !!b.isPreferred) - Number('isPreferred' in a && !!a.isPreferred));
        const fix = candidates[0];
        if (!fix) return `${problem} The language provider has not offered a quick fix for this error.`;
        let text = `${problem} Suggested fix: ${shorten(fix.title, 180)}.`;
        // Resolve and describe the provider's edit, never execute its command or apply it.
        const edits = 'edit' in fix ? fix.edit?.get(document.uri) : undefined;
        if (edits?.length === 1) {
            const edit = edits[0], old = shorten(document.getText(edit.range), 65), replacement = shorten(edit.newText, 85);
            if (old && replacement && old !== replacement) text += ` Replace “${old}” with “${replacement}”.`;
            else if (!old && replacement) text += ` Insert “${replacement}”.`;
            else if (old && !replacement) text += ` Remove “${old}”.`;
        }
        return text;
    } catch {
        return `${problem} I could not retrieve the language provider's quick fixes. Try Read Suggested Fix again.`;
    } finally { clearTimeout(timer); }
}
