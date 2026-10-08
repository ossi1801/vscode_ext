const test = require('node:test');
const assert = require('node:assert/strict');
const { Roaming } = require('../dist/test/roaming.js');
test('waypoints explore the area, turn, and remain bounded after resize', () => {
  let seed = 17;
  const roam = new Roaming(() => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32));
  const quadrants = new Set(), headings = new Set();
  for (let i = 0; i < 2400; i++) {
    roam.step(.1, 48, { width: 500, height: 400 });
    const { x, y } = roam.position;
    assert.ok(x >= 0 && x <= 500 && y >= 0 && y <= 400);
    quadrants.add(`${x > 250},${y > 200}`); headings.add(roam.direction);
  }
  assert.equal(quadrants.size, 4); assert.equal(headings.size, 2);
  roam.step(.1, 48, { width: 100, height: 0 });
  assert.ok(roam.position.x <= 100); assert.equal(roam.position.y, 0);
  const stationary = { ...roam.position };
  roam.step(1, 0, { width: 100, height: 0 }); assert.deepEqual(roam.position, stationary);
  roam.relocate({ width: 100, height: 20 });
  assert.ok(roam.position.x <= 100 && roam.position.y <= 20);
});
function helper(execute) {
  const Module = require('node:module'), original = Module._load;
  Module._load = function(name, ...args) {
    if (name === 'vscode') return {
      commands: { executeCommand: execute },
      CodeActionKind: { QuickFix: { contains: kind => kind.value === 'quickfix' } }
    };
    return original.call(this, name, ...args);
  };
  try {
    delete require.cache[require.resolve('../dist/test/suggestedFix.js')];
    return require('../dist/test/suggestedFix.js').diagnosticExplanation;
  } finally { Module._load = original; }
}
const uri = { toString: () => 'file:///fixture.ts' };
const diagnostic = { source: 'ts', message: "Property 'toUppercase' does not exist. Did you mean 'toUpperCase'?", range: { start: { line: 3 } } };
const document = { uri, getText: () => 'toUppercase' };
test('reads the preferred provider quick fix and its edit without applying it', async () => {
  const calls = [];
  const explain = helper(async (...args) => {
    calls.push(args);
    return [
      { title: 'Ignore this error', kind: { value: 'quickfix' } },
      { title: 'Disabled fix', isPreferred: true, disabled: { reason: 'unavailable' } },
      { title: 'Fix another error', isPreferred: true, diagnostics: [{ message: 'different', range: { start: { line: 3 } } }] },
      { title: "Change spelling to 'toUpperCase'", isPreferred: true, kind: { value: 'quickfix' }, diagnostics: [diagnostic],
        edit: { get: requestedUri => { assert.equal(requestedUri, uri); return [{ range: {}, newText: 'toUpperCase' }]; } } }
    ];
  });
  const speech = await explain(document, diagnostic);
  assert.match(speech, /Line 4/); assert.match(speech, /Suggested fix: Change spelling/);
  assert.match(speech, /Replace “toUppercase” with “toUpperCase”/);
  assert.equal(calls.length, 1); assert.equal(calls[0][0], 'vscode.executeCodeActionProvider');
  assert.equal(calls[0][3], 'quickfix');
});
test('no fixes and provider failures are described without inventing a repair', async () => {
  assert.match(await helper(async () => [])(document, diagnostic), /has not offered a quick fix/);
  assert.match(await helper(async () => { throw Error('offline'); })(document, diagnostic), /could not retrieve/);
});
