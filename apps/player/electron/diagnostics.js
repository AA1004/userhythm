const metaEl = document.getElementById("meta");
const fpsEl = document.getElementById("fps");
const featuresEl = document.getElementById("features");
const gpuInfoEl = document.getElementById("gpuInfo");
const refreshButton = document.getElementById("refresh");
const fullscreenButton = document.getElementById("fullscreen");

const formatJson = (value) => JSON.stringify(value, null, 2);

let fpsState = {
  running: false,
  frameCount: 0,
  startTime: 0,
};

const startFpsSample = () => {
  fpsState = {
    running: true,
    frameCount: 0,
    startTime: performance.now(),
  };

  const loop = (now) => {
    if (!fpsState.running) return;
    fpsState.frameCount += 1;

    const elapsed = now - fpsState.startTime;
    if (elapsed >= 1000) {
      const fps = (fpsState.frameCount * 1000) / elapsed;
      fpsEl.textContent = `Approx ${fps.toFixed(1)} FPS over ${(elapsed / 1000).toFixed(2)}s`;
      fpsState.running = false;
      return;
    }

    requestAnimationFrame(loop);
  };

  requestAnimationFrame(loop);
};

const loadDiagnostics = async () => {
  if (!window.playerApi?.getGpuDiagnostics) {
    metaEl.textContent = "playerApi bridge is not available.";
    featuresEl.textContent = "";
    gpuInfoEl.textContent = "";
    return;
  }

  try {
    const diagnostics = await window.playerApi.getGpuDiagnostics();
    metaEl.textContent = [
      `Timestamp: ${diagnostics.timestamp}`,
      `Target URL: ${diagnostics.targetUrl}`,
      `Profile Path: ${diagnostics.profilePath}`,
      `BGA Mode: ${diagnostics.runtime?.bgaMode || "unknown"}`,
      "",
      formatJson(diagnostics.versions),
      "",
      formatJson(diagnostics.runtime),
    ].join("\n");

    featuresEl.textContent = formatJson(diagnostics.gpuFeatureStatus);
    gpuInfoEl.textContent = formatJson(diagnostics.gpuInfo);
  } catch (error) {
    const message = `Failed to load diagnostics: ${String(error)}`;
    metaEl.textContent = message;
    featuresEl.textContent = "";
    gpuInfoEl.textContent = "";
  }

  startFpsSample();
};

refreshButton.addEventListener("click", () => {
  fpsEl.textContent = "Sampling...";
  loadDiagnostics();
});

fullscreenButton.addEventListener("click", () => {
  if (window.playerApi?.toggleFullscreen) {
    window.playerApi.toggleFullscreen();
  }
});

loadDiagnostics();
