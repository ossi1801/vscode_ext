export interface Issue {
    severity: number;
    range: {
        start: {
            line: number;
            character?: number;
        };
    };
    message: string;
}
export function selectDiagnostic(issues: readonly Issue[], warnings: boolean): Issue | undefined { return [...issues].filter(d => d.severity === 0 || (warnings && d.severity === 1)).sort((a, b) => a.severity - b.severity || a.range.start.line - b.range.start.line)[0]; }
export function userLine(issue: Issue): number { return issue.range.start.line + 1; }
export class ReactionGate {
    private document = '';
    private lastKey = '';
    private lastAt = -Infinity;
    private hadErrors = false;
    reset(document: string) { this.document = document; this.lastKey = ''; this.hadErrors = false; }
    evaluate(document: string, issues: readonly Issue[], warnings: boolean, now: number, cooldown: number): {
        kind: 'error' | 'warning' | 'resolved';
        line?: number;
    } | undefined { if (document !== this.document)
        this.reset(document); const hasErrors = issues.some(d => d.severity === 0); const resolved = this.hadErrors && !hasErrors; const issue = selectDiagnostic(issues, warnings); const key = resolved ? 'resolved' : issue ? JSON.stringify([issue.severity, issue.range.start.line, issue.message]) : ''; if (!key) {
        this.lastKey = '';
        return;
    } if (key === this.lastKey || now - this.lastAt < cooldown)
        return; this.lastAt = now; this.lastKey = key; this.hadErrors = hasErrors; return resolved ? { kind: 'resolved' } : { kind: issue!.severity === 0 ? 'error' : 'warning', line: userLine(issue!) }; }
}
