const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("playerApi", {
  getGpuDiagnostics: () => ipcRenderer.invoke("player:getGpuDiagnostics"),
  getRuntimeInfo: () => ipcRenderer.invoke("player:getRuntimeInfo"),
  setBgaLayerState: (state) => ipcRenderer.send("player:setBgaLayerState", state),
  setBgaLayerBounds: (bounds) => ipcRenderer.send("player:setBgaLayerBounds", bounds),
  retryLoad: () => ipcRenderer.send("player:retryLoad"),
  openDiagnostics: () => ipcRenderer.send("player:openDiagnostics"),
  toggleFullscreen: () => ipcRenderer.send("player:toggleFullscreen"),
});
