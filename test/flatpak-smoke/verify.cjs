// Run while the isolated Flatpak extension test window is open with CDP enabled.
const { WebSocket } = require('undici');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '../../.test-artifacts');
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
async function action(id, command) {
  fs.writeFileSync(path.join(root, 'action.json'), JSON.stringify({ id, command }));
  for (let n = 0; n < 100; n++) {
    await wait(100);
    try { const result = JSON.parse(fs.readFileSync(path.join(root, 'action-result.json'))); if (result.id === id) return result; } catch {}
  }
  throw Error('Extension test did not respond');
}
(async () => {
  const targets = await (await fetch('http://127.0.0.1:' + (process.env.MERLIN_TEST_PORT || '9334') + '/json/list')).json();
  const target = targets.find(t => t.type === 'page' && t.url.includes('workbench'));
  assert.ok(target, 'VS Code workbench target');
  const socket = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise(resolve => socket.addEventListener('open', resolve));
  let id = 0; const pending = new Map();
  socket.addEventListener('message', e => {
    const m = JSON.parse(e.data); if (!m.id) return;
    const p = pending.get(m.id); pending.delete(m.id); m.error ? p.reject(m.error) : p.resolve(m.result);
  });
  const call = (method, params = {}) => new Promise((resolve, reject) => { pending.set(++id, { resolve, reject }); socket.send(JSON.stringify({ id, method, params })); });
  const evaluate = async expression => (await call('Runtime.evaluate', { expression, returnByValue: true })).result.value;
  try {
    const position = () => evaluate(`(() => {
      const e = [...document.querySelectorAll('.view-line span')].find(e => getComputedStyle(e, '::before').content.includes('merlin/frames'));
      if (!e) return null;
      const s = getComputedStyle(e, '::before'), r = e.parentElement.getBoundingClientRect();
      return { x:r.x + parseFloat(s.left), y:r.y + parseFloat(s.top), frame:s.content };
    })()`);
    const before = await position();
    await wait(1500);
    const after = await position();
    assert.ok(before && after && Math.abs(before.x - after.x) >= 20, 'Merlin must roam automatically without a command');
    assert.notEqual(before.y, after.y, 'Merlin must move vertically over code');
    await action('paused', 'merlin.pause');
    await action('speech', 'merlin.speak');
    await wait(300);
    const rendered = await evaluate(`(() => {
      const elements = [...document.querySelectorAll('.view-line span')].map(e => ({ e, s: getComputedStyle(e, '::before') }));
      const sprite = elements.find(({s}) => s.content.includes('merlin/frames'));
      const bubble = elements.find(({s}) => s.position === 'absolute' && s.content.length > 10 && !s.content.includes('url('));
      if (!sprite) return {};
      const {e,s} = sprite, r = e.parentElement.getBoundingClientRect();
      const x = r.x + parseFloat(s.left) + parseFloat(s.width)/2, y = r.y + parseFloat(s.top) + parseFloat(s.height)/2;
      return { sprite: { content:s.content, position:s.position, pointerEvents:s.pointerEvents, width:s.width, height:s.height, x,y, anchorWidth:e.getBoundingClientRect().width },
        bubble: bubble && { content:bubble.s.content, pointerEvents:bubble.s.pointerEvents },
        hit: document.elementFromPoint(x,y)?.closest('.view-line')?.textContent };
    })()`);
    assert.equal(rendered.sprite?.position, 'absolute');
    assert.equal(rendered.sprite.pointerEvents, 'none');
    assert.equal(rendered.sprite.width, '96px');
    assert.equal(rendered.sprite.anchorWidth, 0, 'Sprite must not reserve horizontal code space');
    assert.match(rendered.hit, /const.*Merlin/, 'Pointer must hit code beneath the sprite');
    assert.equal(rendered.bubble?.pointerEvents, 'none');
    const screenshot = await call('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(path.join(root, 'editor-overlay.png'), Buffer.from(screenshot.data, 'base64'));
    const {x,y} = rendered.sprite;
    await call('Input.dispatchMouseEvent', { type:'mousePressed', x,y, button:'left', clickCount:1 });
    await call('Input.dispatchMouseEvent', { type:'mouseReleased', x,y, button:'left', clickCount:1 });
    await call('Input.insertText', { text:'MERLIN_CLICK_TEST' });
    await wait(200);
    const edited = await action('edited');
    assert.ok(edited.text.includes('MERLIN_CLICK_TEST'), 'Typing through sprite must edit the real document');
    await call('Input.dispatchMouseEvent', { type:'mousePressed', x,y, button:'left', clickCount:1 });
    await call('Input.dispatchMouseEvent', { type:'mouseMoved', x:x+100,y, button:'left', buttons:1 });
    await call('Input.dispatchMouseEvent', { type:'mouseReleased', x:x+100,y, button:'left', clickCount:1 });
    const selected = await action('selected');
    assert.notDeepEqual(selected.selection.start, selected.selection.end, 'Dragging through sprite must select code');
    await action('explain', 'merlin.explainError');
    await wait(300);
    const suggestedFix = await evaluate(`(() => {
      return [...document.querySelectorAll('.view-line span')].map(e => getComputedStyle(e, '::before').content).find(text => text.includes('Suggested fix:'));
    })()`);
    assert.match(suggestedFix, /toUpperCase/, 'Merlin must read the real TypeScript spelling quick fix');
    const unchanged = await action('unchanged');
    assert.ok(unchanged.text.includes("'magic'.toUppercase()"), 'Reading a fix must not apply it');
    const evidence = { ...rendered, automaticMovement:{before,after}, typedThroughSprite:true, selectedThroughSprite:true, suggestedFix, runtime:JSON.parse(fs.readFileSync(path.join(root, 'ready.json'))) };
    fs.writeFileSync(path.join(root, 'verification.json'), JSON.stringify(evidence, null, 2));
    console.log(JSON.stringify(evidence, null, 2));
  } finally { socket.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
