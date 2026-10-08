const errors = ['It seems you have an error at line {line}. Shall I blame the goblins?', 'Line {line} has displeased the compiler spirits.', 'My wand says line {line} needs a little less chaos.', 'A tiny code gremlin is camping on line {line}. Tea might help.'];
const warnings = ['A small enchanted caution sign has appeared at line {line}.', 'Line {line} has raised one wizardly eyebrow.'];
const manual = ['I cast a spell of productivity. The tea is now slightly warmer.', 'My hat contains three spells and one very confused semicolon.', 'Have you tried turning the goblin off and on again?'];
export class Dialogue {
    private last = new Map<string, number>();
    next(kind: 'error' | 'warning' | 'manual', line = 1): string { const list = kind === 'error' ? errors : kind === 'warning' ? warnings : manual; const old = this.last.get(kind); const options = list.map((_, i) => i).filter(i => i !== old); const index = options[Math.floor(Math.random() * options.length)]; this.last.set(kind, index); return list[index].replace('{line}', String(line)); }
}
