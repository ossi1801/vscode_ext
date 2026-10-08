const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
function acquireWindow(id, root = path.join(os.tmpdir(), `merlin-${require('node:crypto').createHash('sha256').update(os.userInfo().username).digest('hex').slice(0, 16)}`)) {
  if (!/^0x[0-9a-f]+$/i.test(id)) throw Error('Invalid window identity');
  fs.mkdirSync(root, { mode: 0o700, recursive: true });
  const info = fs.lstatSync(root);
  if (!info.isDirectory() || info.isSymbolicLink() || (process.platform !== 'win32' && (info.uid !== process.getuid() || (info.mode & 0o077))))
    throw Error('Companion ownership directory is not private');
  const file = path.join(root, id.toLowerCase() + '.lock');
  let fd;
  try { fd = fs.openSync(file, 'wx', 0o600); }
  catch (error) {
    if (error.code !== 'EEXIST') throw error;
    // Fail closed: stale locks are removed explicitly after checking process state.
    throw Error(`A companion already owns this window, or a stale lock remains: ${file}`);
  }
  fs.writeFileSync(fd, String(process.pid));
  return () => { fs.closeSync(fd); fs.unlinkSync(file); };
}
module.exports = { acquireWindow };
