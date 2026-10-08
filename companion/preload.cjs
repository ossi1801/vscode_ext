const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('merlinDesktop', {
  subscribe: callback => ipcRenderer.on('merlin', (_event, message) => callback(message)),
  postMessage: message => {
    if (message?.type === 'voiceEnded' && Number.isSafeInteger(message.id)) ipcRenderer.send('voiceEnded', { id: message.id, played: message.played === true });
    if (['ready', 'dismiss', 'pause'].includes(message?.type)) ipcRenderer.send('renderer', message);
    if (message?.type === 'voiceStatus' && typeof message.status === 'string')
      ipcRenderer.send('voiceStatus', message.status.slice(0, 500));
    if (message?.type === 'voices' && Array.isArray(message.voices))
      ipcRenderer.send('voices', message.voices.slice(0, 100).map(v => ({
        id: String(v.id).slice(0, 300), name: String(v.name).slice(0, 300)
      })));
  }
});
