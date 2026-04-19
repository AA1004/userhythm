const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("playerApi", {
  getGpuDiagnostics: () => ipcRenderer.invoke("player:getGpuDiagnostics"),
  retryLoad: () => ipcRenderer.send("player:retryLoad"),
  openDiagnostics: () => ipcRenderer.send("player:openDiagnostics"),
  toggleFullscreen: () => ipcRenderer.send("player:toggleFullscreen"),
});

