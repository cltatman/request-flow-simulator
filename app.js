(function () {
  "use strict";

  const canvas = document.getElementById("simulationCanvas");
  const ctx = canvas.getContext("2d");

  const elements = {
    pauseButton: document.getElementById("pauseButton"),
    resetButton: document.getElementById("resetButton"),
    speedSlider: document.getElementById("speedSlider"),
    speedOutput: document.getElementById("speedOutput"),
    retryFixEnabled: document.getElementById("retryFixEnabled"),
    concurrencyLimitEnabled: document.getElementById("concurrencyLimitEnabled"),
    memorySheddingEnabled: document.getElementById("memorySheddingEnabled"),
  };

  const controlDefs = {
    rate: { min: 0, max: 2000, step: 100, value: 300, decimals: 0 },
    containers: { min: 5, max: 40, step: 1, value: 20, decimals: 0 },
    baseline: { min: 20, max: 3000, step: 10, value: 250, decimals: 0 },
    dependency: { min: 100, max: 2000, step: 100, value: 100, decimals: 0 },
    memory: { min: 3, max: 25, step: 1, value: 25, decimals: 0 },
    baselineMemory: { min: 0, max: 2048, step: 25, value: 800, decimals: 0 },
    limit: { min: 1024, max: 5120, step: 512, value: 5120, decimals: 1, displayScale: 1024 },
    restartDelay: { min: 10, max: 60, step: 1, value: 15, decimals: 0 },
    skew: { min: 0, max: 100, step: 1, value: 0, decimals: 0 },
    hotCount: { min: 1, max: 5, step: 1, value: 1, decimals: 0 },
    fixedDependency: { min: 100, max: 400, step: 50, value: 400, decimals: 0 },
    concurrencyLimit: { min: 10, max: 100, step: 10, value: 100, decimals: 0 },
    memorySheddingThreshold: { min: 50, max: 90, step: 1, value: 80, decimals: 0 },
  };

  const controlElements = {
    rate: {
      slider: document.getElementById("rateSlider"),
      input: document.getElementById("rateInput"),
      output: document.getElementById("rateOutput"),
    },
    containers: {
      slider: document.getElementById("containerSlider"),
      input: document.getElementById("containerInput"),
      output: document.getElementById("containerOutput"),
    },
    baseline: {
      slider: document.getElementById("baselineSlider"),
      input: document.getElementById("baselineInput"),
      output: document.getElementById("baselineOutput"),
    },
    dependency: {
      slider: document.getElementById("dependencySlider"),
      input: document.getElementById("dependencyInput"),
      output: document.getElementById("dependencyOutput"),
    },
    memory: {
      slider: document.getElementById("memorySlider"),
      input: document.getElementById("memoryInput"),
      output: document.getElementById("memoryOutput"),
    },
    baselineMemory: {
      slider: document.getElementById("baselineMemorySlider"),
      input: document.getElementById("baselineMemoryInput"),
      output: document.getElementById("baselineMemoryOutput"),
    },
    limit: {
      slider: document.getElementById("limitSlider"),
      input: document.getElementById("limitInput"),
      output: document.getElementById("limitOutput"),
    },
    restartDelay: {
      slider: document.getElementById("restartDelaySlider"),
      input: document.getElementById("restartDelayInput"),
      output: document.getElementById("restartDelayOutput"),
    },
    skew: {
      slider: document.getElementById("skewSlider"),
      input: document.getElementById("skewInput"),
      output: document.getElementById("skewOutput"),
    },
    hotCount: {
      slider: document.getElementById("hotCountSlider"),
      input: document.getElementById("hotCountInput"),
      output: document.getElementById("hotCountOutput"),
    },
    fixedDependency: {
      slider: document.getElementById("fixedDependencySlider"),
      output: document.getElementById("fixedDependencyOutput"),
    },
    concurrencyLimit: {
      slider: document.getElementById("concurrencyLimitSlider"),
      output: document.getElementById("concurrencyLimitOutput"),
    },
    memorySheddingThreshold: {
      slider: document.getElementById("memorySheddingThresholdSlider"),
      output: document.getElementById("memorySheddingThresholdOutput"),
    },
  };

  const state = {
    rate: 300,
    containers: 20,
    baseline: 250,
    dependency: 100,
    memory: 25,
    baselineMemory: 800,
    limit: 5120,
    restartDelay: 15,
    skew: 0,
    hotCount: 1,
    retryFixEnabled: false,
    concurrencyLimitEnabled: false,
    memorySheddingEnabled: false,
    fixedDependency: 400,
    concurrencyLimit: 100,
    memorySheddingThreshold: 80,
    speed: 1,
    paused: false,
    requests: [],
    completedAt: [],
    emitAccumulator: 0,
    retryQueue: [],
    nextId: 1,
    width: 0,
    height: 0,
    dpr: 1,
    simTime: 0,
    lastFrameAt: performance.now(),
    weights: [],
    health: [],
    hotIndexes: [],
    admissionCounts: [],
    rejectedCount: 0,
  };

  const colors = {
    ink: "#142129",
    muted: "rgba(20, 33, 41, 0.62)",
    grid: "rgba(20, 33, 41, 0.07)",
    line: "rgba(20, 33, 41, 0.16)",
    blue: "56, 162, 255",
    green: "37, 196, 122",
    amber: "255, 138, 0",
    red: "255, 93, 108",
    violet: "161, 116, 255",
  };

  const timing = {
    ingressMs: 280,
    egressMs: 260,
    maxActiveRequests: 60000,
    maxRenderedParticles: 12000,
    maxEmitPerFrame: 5000,
    completionWindowMs: 1000,
    retryJitterMs: 850,
  };

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }

  function lerp(a, b, t) {
    return a + (b - a) * t;
  }

  function smoothstep(t) {
    return t * t * (3 - 2 * t);
  }

  function roundedRect(context, x, y, width, height, radius) {
    const r = Math.min(radius, width / 2, height / 2);
    context.beginPath();
    context.moveTo(x + r, y);
    context.lineTo(x + width - r, y);
    context.quadraticCurveTo(x + width, y, x + width, y + r);
    context.lineTo(x + width, y + height - r);
    context.quadraticCurveTo(x + width, y + height, x + width - r, y + height);
    context.lineTo(x + r, y + height);
    context.quadraticCurveTo(x, y + height, x, y + height - r);
    context.lineTo(x, y + r);
    context.quadraticCurveTo(x, y, x + r, y);
    context.closePath();
  }

  function formatNumber(value, decimals) {
    return Number(value).toLocaleString("en-US", {
      maximumFractionDigits: decimals,
      minimumFractionDigits: decimals,
    });
  }

  function formatMemory(mib) {
    if (mib >= 1024) {
      return `${formatNumber(mib / 1024, 1)} GiB`;
    }
    if (mib >= 100) {
      return `${formatNumber(mib, 0)} MiB`;
    }
    return `${formatNumber(mib, 1)} MiB`;
  }

  function formatControlValue(name, value, def) {
    if (def.displayScale) {
      return formatNumber(value / def.displayScale, def.decimals);
    }
    return formatNumber(value, def.decimals);
  }

  function ensureHealth() {
    while (state.health.length < state.containers) {
      state.health.push({ unavailableUntil: 0, deaths: 0 });
    }
    if (state.health.length > state.containers) {
      state.health.length = state.containers;
    }
  }

  function resetHealth() {
    state.health = [];
    ensureHealth();
  }

  function isContainerAvailable(index) {
    const health = state.health[index];
    return !health || health.unavailableUntil <= state.simTime;
  }

  function getEffectiveDependencyLatency() {
    return state.retryFixEnabled ? state.fixedDependency : state.dependency;
  }

  function requestHoldsMemory(request) {
    const elapsed = state.simTime - request.bornAt;
    return elapsed >= 0 && elapsed <= timing.ingressMs + request.totalLatency;
  }

  function countActiveByContainer() {
    const counts = new Array(state.containers).fill(0);
    for (const request of state.requests) {
      if (
        request.containerIndex < counts.length &&
        isContainerAvailable(request.containerIndex) &&
        requestHoldsMemory(request)
      ) {
        counts[request.containerIndex] += 1;
      }
    }
    return counts;
  }

  function getContainerRejectionReason(index) {
    if (index < 0 || index >= state.containers || !isContainerAvailable(index)) {
      return "unavailable";
    }

    const count = state.admissionCounts[index] || 0;
    if (state.concurrencyLimitEnabled && count >= state.concurrencyLimit) {
      return "concurrency";
    }

    const projectedMemory = state.baselineMemory + (count + 1) * state.memory;
    const sheddingThresholdMemory = state.limit * (state.memorySheddingThreshold / 100);
    if (state.memorySheddingEnabled && projectedMemory >= sheddingThresholdMemory) {
      return "memory";
    }

    return "";
  }

  function canContainerAccept(index) {
    return getContainerRejectionReason(index) === "";
  }

  function hasLoadSheddingPressure() {
    for (let index = 0; index < state.containers; index += 1) {
      const reason = getContainerRejectionReason(index);
      if (reason === "concurrency" || reason === "memory") {
        return true;
      }
    }
    return false;
  }

  function randomItem(items) {
    return items[Math.floor(Math.random() * items.length)];
  }

  function getDesiredHotCount() {
    return Math.min(state.containers, Math.max(1, Math.round(state.hotCount)));
  }

  function refreshHotIndexes(options) {
    const settings = options || {};
    ensureHealth();

    if (state.skew <= 0) {
      state.hotIndexes = [];
      return;
    }

    const desired = getDesiredHotCount();
    const selected = new Set();
    const existing = settings.forceRandom ? [] : state.hotIndexes;

    for (const index of existing) {
      if (
        selected.size < desired &&
        index >= 0 &&
        index < state.containers &&
        (!settings.replaceUnavailable || isContainerAvailable(index))
      ) {
        selected.add(index);
      }
    }

    while (selected.size < desired) {
      const candidates = [];
      for (let index = 0; index < state.containers; index += 1) {
        if (!selected.has(index) && isContainerAvailable(index)) {
          candidates.push(index);
        }
      }
      if (!candidates.length) {
        break;
      }
      selected.add(randomItem(candidates));
    }

    state.hotIndexes = Array.from(selected);
  }

  function getAvailableWeightTotal() {
    let total = 0;
    for (let index = 0; index < state.containers; index += 1) {
      if (isContainerAvailable(index)) {
        total += state.weights[index] || 0;
      }
    }
    return total;
  }

  function syncControl(name, rawValue, options) {
    const def = controlDefs[name];
    const refs = controlElements[name];
    const max = name === "hotCount" ? Math.min(def.max, state.containers || def.max) : def.max;
    const parsed = Number(rawValue);
    const fallback = Number.isFinite(parsed) ? parsed : def.value;
    const stepped = Math.round(fallback / def.step) * def.step;
    const value = clamp(stepped, def.min, max);
    const display = formatControlValue(name, value, def);

    state[name] = value;
    refs.slider.min = String(def.min);
    refs.slider.max = String(max);
    refs.slider.step = String(def.step);
    refs.slider.value = String(value);
    if (refs.input) {
      refs.input.min = String(def.min);
      refs.input.max = String(max);
      refs.input.step = String(def.step);
      refs.input.value = String(value);
    }
    refs.output.textContent = display;

    if (name === "containers") {
      state.hotCount = clamp(state.hotCount, 1, Math.min(5, state.containers));
      syncControl("hotCount", state.hotCount, { skipWeights: true });
      if (!options || !options.keepRequests) {
        resetSimulation();
      } else {
        ensureHealth();
      }
    }

    if (!options || !options.skipWeights) {
      rebuildWeights();
    }
  }

  function syncSpeed(rawValue) {
    const parsed = Number(rawValue);
    const value = clamp(Number.isFinite(parsed) ? parsed : 1, 0.1, 1);
    state.speed = value;
    elements.speedSlider.value = String(value);
    elements.speedOutput.textContent = value.toFixed(1);
  }

  function syncToggle(name, checked) {
    state[name] = Boolean(checked);
    elements[name].checked = state[name];
  }

  function bindControls() {
    for (const name of Object.keys(controlDefs)) {
      const refs = controlElements[name];
      refs.slider.addEventListener("input", (event) => {
        syncControl(name, event.target.value);
      });
      if (refs.input) {
        refs.input.addEventListener("input", (event) => {
          syncControl(name, event.target.value);
        });
      }
    }

    elements.speedSlider.addEventListener("input", (event) => {
      syncSpeed(event.target.value);
    });

    for (const name of ["retryFixEnabled", "concurrencyLimitEnabled", "memorySheddingEnabled"]) {
      elements[name].addEventListener("change", (event) => {
        syncToggle(name, event.target.checked);
      });
    }

    elements.pauseButton.addEventListener("click", () => {
      state.paused = !state.paused;
      elements.pauseButton.textContent = state.paused ? "Resume" : "Pause";
      state.lastFrameAt = performance.now();
    });

    elements.resetButton.addEventListener("click", () => {
      resetSimulation();
    });

  }

  function clearRequests() {
    state.requests = [];
    state.completedAt = [];
    state.emitAccumulator = 0;
    state.retryQueue = [];
    state.nextId = 1;
    state.admissionCounts = new Array(state.containers).fill(0);
    state.rejectedCount = 0;
  }

  function resetSimulation() {
    clearRequests();
    resetHealth();
    refreshHotIndexes({ forceRandom: true, replaceUnavailable: true });
    rebuildWeights();
  }

  function rebuildWeights() {
    const n = state.containers;
    const skew = clamp(state.skew / 100, 0, 0.95);
    refreshHotIndexes({ replaceUnavailable: true });

    state.weights = new Array(n);
    const hotSet = new Set(state.hotIndexes);
    const effectiveHotCount = hotSet.size;
    if (skew <= 0 || effectiveHotCount <= 0 || effectiveHotCount >= n) {
      const equal = 1 / n;
      state.weights.fill(equal);
      return;
    }

    const hotWeight = skew / effectiveHotCount;
    const coldWeight = (1 - skew) / (n - effectiveHotCount);
    for (let index = 0; index < n; index += 1) {
      state.weights[index] = hotSet.has(index) ? hotWeight : coldWeight;
    }
  }

  function pickContainer() {
    const availableTotal = getAvailableWeightTotal();
    if (availableTotal <= 0) {
      return -1;
    }

    const sample = Math.random() * availableTotal;
    let total = 0;
    for (let index = 0; index < state.weights.length; index += 1) {
      if (!isContainerAvailable(index)) {
        continue;
      }
      total += state.weights[index];
      if (sample <= total) {
        return index;
      }
    }

    for (let index = state.weights.length - 1; index >= 0; index -= 1) {
      if (isContainerAvailable(index)) {
        return index;
      }
    }
    return -1;
  }

  function resizeCanvas() {
    const rect = canvas.getBoundingClientRect();
    state.dpr = Math.max(1, Math.min(2, window.devicePixelRatio || 1));
    state.width = Math.max(360, Math.floor(rect.width));
    state.height = Math.max(520, Math.floor(rect.height));
    canvas.width = Math.floor(state.width * state.dpr);
    canvas.height = Math.floor(state.height * state.dpr);
    ctx.setTransform(state.dpr, 0, 0, state.dpr, 0, 0);
  }

  function getLayout() {
    const width = state.width;
    const height = state.height;
    const marginX = clamp(width * 0.045, 28, 64);

    const area = {
      x: marginX,
      y: 42,
      width: Math.max(160, width - marginX * 2),
      height: height - 84,
    };

    let cols = Math.ceil(Math.sqrt(state.containers * (area.width / Math.max(area.height, 1))));
    cols = clamp(cols, 1, state.containers);
    let rows = Math.ceil(state.containers / cols);
    const gap = clamp(area.width / 70, 7, 12);
    let boxW = (area.width - gap * (cols - 1)) / cols;
    let boxH = (area.height - gap * (rows - 1)) / rows;

    if (boxH > 92 && rows > 1) {
      cols = Math.max(1, cols - 1);
      rows = Math.ceil(state.containers / cols);
      boxW = (area.width - gap * (cols - 1)) / cols;
      boxH = (area.height - gap * (rows - 1)) / rows;
    }

    const usedWidth = boxW * cols + gap * (cols - 1);
    const usedHeight = boxH * rows + gap * (rows - 1);
    const startX = area.x + Math.max(0, (area.width - usedWidth) / 2);
    const startY = area.y + Math.max(0, (area.height - usedHeight) / 2);

    const boxes = [];
    for (let index = 0; index < state.containers; index += 1) {
      const col = index % cols;
      const row = Math.floor(index / cols);
      boxes.push({
        index,
        x: startX + col * (boxW + gap),
        y: startY + row * (boxH + gap),
        w: boxW,
        h: boxH,
      });
    }

    return { boxes };
  }

  function spawnRequest(bornAt, options) {
    const settings = options || {};
    if (state.requests.length >= timing.maxActiveRequests) {
      return { accepted: false, requeued: false };
    }

    const containerIndex = pickContainer();
    if (containerIndex < 0) {
      state.rejectedCount += 1;
      if (settings.requeueOnLoadShed && hasLoadSheddingPressure()) {
        scheduleRetries(1);
        return { accepted: false, requeued: true };
      }
      return { accepted: false, requeued: false };
    }

    const rejectionReason = getContainerRejectionReason(containerIndex);
    if (rejectionReason) {
      state.rejectedCount += 1;
      if (
        settings.requeueOnLoadShed &&
        (rejectionReason === "concurrency" || rejectionReason === "memory")
      ) {
        scheduleRetries(1);
        return { accepted: false, requeued: true };
      }
      return { accepted: false, requeued: false };
    }

    const dependency = Math.max(0, getEffectiveDependencyLatency());
    const totalLatency = Math.max(1, state.baseline + dependency);
    const baselineBefore = Math.max(10, Math.min(state.baseline * 0.6, totalLatency * 0.45));
    const baselineAfter = Math.max(0, state.baseline - baselineBefore);

    state.requests.push({
      id: state.nextId,
      bornAt,
      containerIndex,
      baselineBefore,
      baselineAfter,
      dependency,
      totalLatency,
      retry: Boolean(settings.retry),
      lane: Math.random(),
      jitter: (Math.random() - 0.5) * 14,
      wobble: Math.random() * Math.PI * 2,
      radius: state.requests.length > 4000 ? 1.4 : state.requests.length > 1600 ? 1.8 : 2.4,
    });
    state.nextId += 1;
    state.admissionCounts[containerIndex] = (state.admissionCounts[containerIndex] || 0) + 1;
    return { accepted: true, requeued: false };
  }

  function scheduleRetries(count) {
    for (let index = 0; index < count; index += 1) {
      const jitter = Math.random() * timing.retryJitterMs;
      state.retryQueue.push(state.simTime + jitter);
    }
  }

  function enforceMemoryLimits() {
    if (state.limit <= 0) {
      return;
    }

    ensureHealth();
    const counts = countActiveByContainer();

    const failed = new Set();
    for (let index = 0; index < counts.length; index += 1) {
      const totalMemory = state.baselineMemory + counts[index] * state.memory;
      if (totalMemory >= state.limit && isContainerAvailable(index)) {
        failed.add(index);
      }
    }

    if (!failed.size) {
      return;
    }

    for (const index of failed) {
      const health = state.health[index];
      health.deaths += 1;
      health.unavailableUntil = state.simTime + Math.max(0, state.restartDelay) * 1000;
    }

    rebuildWeights();
    let dropped = 0;
    state.requests = state.requests.filter((request) => {
      if (!failed.has(request.containerIndex)) {
        return true;
      }

      const elapsed = state.simTime - request.bornAt;
      const completeAt = timing.ingressMs + request.totalLatency;
      if (elapsed <= completeAt) {
        dropped += 1;
      }
      return false;
    });
    scheduleRetries(dropped);
  }

  function advance(simDelta) {
    rebuildWeights();

    const active = [];
    for (const request of state.requests) {
      const elapsed = state.simTime - request.bornAt;
      const completeAt = timing.ingressMs + request.totalLatency;
      if (elapsed <= completeAt + timing.egressMs) {
        active.push(request);
      } else {
        state.completedAt.push(state.simTime);
      }
    }
    state.requests = active;
    state.admissionCounts = countActiveByContainer();

    if (state.rate > 0) {
      state.emitAccumulator += (simDelta / 1000) * state.rate;
    }

    const count = Math.min(Math.floor(state.emitAccumulator), timing.maxEmitPerFrame);
    if (count > 0) {
      const interval = state.rate > 0 ? 1000 / state.rate : 0;
      for (let index = 0; index < count; index += 1) {
        spawnRequest(state.simTime - (count - index - 1) * interval, { requeueOnLoadShed: true });
      }
      state.emitAccumulator -= count;
    }

    let retried = 0;
    let retryAttempts = 0;
    for (
      let index = state.retryQueue.length - 1;
      index >= 0 && retryAttempts < timing.maxEmitPerFrame;
      index -= 1
    ) {
      const dueAt = state.retryQueue[index];
      if (dueAt > state.simTime) {
        continue;
      }
      retryAttempts += 1;
      const result = spawnRequest(dueAt, { retry: true, requeueOnLoadShed: true });
      if (result.accepted || result.requeued) {
        state.retryQueue.splice(index, 1);
      }
      if (result.accepted) {
        retried += 1;
      }
    }

    enforceMemoryLimits();

    const cutoff = state.simTime - timing.completionWindowMs;
    while (state.completedAt.length && state.completedAt[0] < cutoff) {
      state.completedAt.shift();
    }
  }

  function getStats() {
    ensureHealth();
    refreshHotIndexes({ replaceUnavailable: true });
    const availableTotal = getAvailableWeightTotal();
    const effectiveDependency = getEffectiveDependencyLatency();
    const hotSet = new Set(state.hotIndexes);
    const containers = [];
    for (let index = 0; index < state.containers; index += 1) {
      const available = isContainerAvailable(index);
      const remainingMs = Math.max(0, state.health[index].unavailableUntil - state.simTime);
      const weight = available && availableTotal > 0 ? (state.weights[index] || 0) / availableTotal : 0;
      containers.push({
        count: 0,
        memory: 0,
        requestMemory: 0,
        baselineMemory: available ? state.baselineMemory : 0,
        rate: state.rate * weight,
        available,
        remainingMs,
        deaths: state.health[index].deaths,
        hot: hotSet.has(index),
      });
    }

    let totalInflight = 0;
    for (const request of state.requests) {
      if (
        requestHoldsMemory(request) &&
        request.containerIndex < containers.length &&
        containers[request.containerIndex].available
      ) {
        containers[request.containerIndex].count += 1;
        totalInflight += 1;
      }
    }

    let clusterMemory = 0;
    let hotMemory = 0;
    let hotCount = 0;
    let hotIndex = 0;
    let hotRoutingMemory = 0;
    let hotRoutingCount = 0;
    let unavailableCount = 0;
    for (let index = 0; index < containers.length; index += 1) {
      const stat = containers[index];
      if (!stat.available) {
        unavailableCount += 1;
      }
      stat.requestMemory = stat.count * state.memory;
      stat.memory = stat.baselineMemory + stat.requestMemory;
      clusterMemory += stat.memory;
      if (stat.hot) {
        hotRoutingMemory += stat.memory;
        hotRoutingCount += stat.count;
      }
      if (stat.memory > hotMemory) {
        hotMemory = stat.memory;
        hotCount = stat.count;
        hotIndex = index;
      }
    }

    return {
      containers,
      totalInflight,
      clusterMemory,
      hotMemory,
      hotCount,
      hotIndex,
      hotRoutingMemory,
      hotRoutingCount,
      hotRoutingIndexes: state.hotIndexes.slice(),
      unavailableCount,
      retryBacklog: state.retryQueue.length,
      rejectedCount: state.rejectedCount,
      observedRate: state.completedAt.length,
      expectedInflight: state.rate * ((state.baseline + effectiveDependency) / 1000),
      expectedMemory:
        (state.containers - unavailableCount) * state.baselineMemory +
        state.rate * ((state.baseline + effectiveDependency) / 1000) * state.memory,
      effectiveDependency,
    };
  }

  function getRequestPosition(request, layout) {
    const box = layout.boxes[request.containerIndex] || layout.boxes[0];
    const elapsed = state.simTime - request.bornAt;
    const boxCx = box.x + box.w * 0.5;
    const boxCy = box.y + box.h * (0.28 + request.lane * 0.44) + request.jitter;
    const baselineBeforeEnd = timing.ingressMs + request.baselineBefore;
    const dependencyEnd = baselineBeforeEnd + request.dependency;
    const completeAt = timing.ingressMs + request.totalLatency;

    if (elapsed < timing.ingressMs) {
      const t = smoothstep(clamp(elapsed / timing.ingressMs, 0, 1));
      return {
        x: lerp(box.x + box.w * 0.02, box.x + box.w * 0.12, t),
        y: boxCy + Math.sin(t * Math.PI + request.wobble) * 3,
        phase: "ingress",
        alpha: 0.55 + t * 0.4,
      };
    }

    if (elapsed < baselineBeforeEnd) {
      const t = clamp((elapsed - timing.ingressMs) / Math.max(1, request.baselineBefore), 0, 1);
      return {
        x: lerp(box.x + box.w * 0.12, boxCx, t),
        y: boxCy + Math.sin(t * Math.PI * 2 + request.wobble) * 4,
        phase: "service",
        alpha: 1,
      };
    }

    if (elapsed < dependencyEnd) {
      const t = clamp((elapsed - baselineBeforeEnd) / Math.max(1, request.dependency), 0, 1);
      return {
        x: lerp(box.x + box.w * 0.42, box.x + box.w * 0.58, t),
        y: boxCy + Math.sin(t * Math.PI * 5 + request.wobble) * 3,
        phase: "dependency",
        alpha: 0.92,
      };
    }

    if (elapsed < completeAt) {
      const t = clamp((elapsed - dependencyEnd) / Math.max(1, request.baselineAfter), 0, 1);
      return {
        x: lerp(box.x + box.w * 0.58, box.x + box.w * 0.88, t),
        y: boxCy + Math.sin(t * Math.PI * 2 + request.wobble) * 3,
        phase: "service",
        alpha: 1,
      };
    }

    const t = smoothstep(clamp((elapsed - completeAt) / timing.egressMs, 0, 1));
    return {
      x: lerp(box.x + box.w * 0.88, box.x + box.w * 0.98, t),
      y: boxCy,
      phase: "egress",
      alpha: 1 - t * 0.65,
    };
  }

  function drawBackground() {
    ctx.clearRect(0, 0, state.width, state.height);
  }

  function pressureColor(ratio) {
    if (ratio >= 0.9) {
      return colors.red;
    }
    if (ratio >= 0.65) {
      return colors.amber;
    }
    return colors.green;
  }

  function drawContainers(layout, stats) {
    for (const box of layout.boxes) {
      const stat = stats.containers[box.index];
      const ratio = state.limit > 0 ? stat.memory / state.limit : 0;
      const unavailable = !stat.available;
      const color = unavailable ? colors.red : pressureColor(ratio);
      const fillHeight = box.h * clamp(ratio, 0, 1);
      const small = box.w < 92 || box.h < 60;
      const tiny = box.w < 72 || box.h < 50;

      ctx.save();
      roundedRect(ctx, box.x, box.y, box.w, box.h, 7);
      ctx.fillStyle = unavailable ? "#fff3f3" : "#ffffff";
      ctx.fill();
      ctx.strokeStyle = `rgba(${color}, ${unavailable || ratio > 0.8 ? 0.86 : 0.5})`;
      ctx.lineWidth = unavailable || ratio > 0.9 ? 2.5 : 1.4;
      if (unavailable) {
        ctx.setLineDash([5, 4]);
      }
      ctx.stroke();
      ctx.setLineDash([]);

      ctx.save();
      ctx.beginPath();
      roundedRect(ctx, box.x, box.y, box.w, box.h, 7);
      ctx.clip();
      if (unavailable) {
        ctx.fillStyle = `rgba(${colors.red}, 0.16)`;
        ctx.fillRect(box.x, box.y, box.w, box.h);
      } else {
        ctx.fillStyle = `rgba(${color}, ${ratio > 1 ? 0.32 : 0.18})`;
        ctx.fillRect(box.x, box.y + box.h - fillHeight, box.w, fillHeight);
      }
      ctx.restore();

      ctx.fillStyle = colors.ink;
      ctx.textAlign = "left";
      ctx.textBaseline = "alphabetic";
      ctx.font = `700 ${tiny ? 8 : small ? 9 : 11}px Inter, system-ui, sans-serif`;
      ctx.fillText(`web-${String(box.index + 1).padStart(2, "0")}`, box.x + 7, box.y + (tiny ? 13 : 16));

      if (stat.hot && !unavailable) {
        ctx.fillStyle = `rgba(${colors.violet}, 0.92)`;
        ctx.beginPath();
        ctx.arc(box.x + box.w - 10, box.y + 11, tiny ? 2.2 : 3.1, 0, Math.PI * 2);
        ctx.fill();
      }

      if (unavailable) {
        ctx.fillStyle = `rgba(${colors.red}, 0.96)`;
        ctx.font = `700 ${tiny ? 8 : small ? 9 : 10}px Inter, system-ui, sans-serif`;
        ctx.fillText(tiny ? "down" : "unavailable", box.x + 7, box.y + box.h - (tiny ? 20 : 25));
        ctx.fillStyle = colors.ink;
        ctx.font = `700 ${tiny ? 8 : small ? 9 : 10}px Inter, system-ui, sans-serif`;
        ctx.fillText(`${formatNumber(stat.remainingMs / 1000, 1)}s`, box.x + 7, box.y + box.h - (tiny ? 8 : 10));
        ctx.restore();
        continue;
      }

      ctx.fillStyle = colors.muted;
      ctx.font = `600 ${tiny ? 8 : small ? 9 : 10}px Inter, system-ui, sans-serif`;
      const countLabel = tiny ? `${stat.count}` : `${stat.count} in flight`;
      ctx.fillText(countLabel, box.x + 7, box.y + box.h - (tiny ? 20 : 25));
      ctx.fillStyle = ratio >= 0.9 ? `rgba(${colors.red}, 0.95)` : colors.ink;
      ctx.font = `700 ${tiny ? 8 : small ? 9 : 10}px Inter, system-ui, sans-serif`;
      const memoryLabel = tiny ? formatMemory(stat.memory) : `${formatMemory(stat.memory)} total`;
      ctx.fillText(memoryLabel, box.x + 7, box.y + box.h - (tiny ? 8 : 10));

      if (!tiny && !stat.hot) {
        ctx.fillStyle = "rgba(20, 33, 41, 0.45)";
        ctx.textAlign = "right";
        ctx.font = "600 9px Inter, system-ui, sans-serif";
        ctx.fillText(`${formatNumber(stat.rate, 1)} rps`, box.x + box.w - 7, box.y + 16);
      }
      ctx.restore();
    }
  }

  function drawParticles(layout) {
    const stride = Math.max(1, Math.ceil(state.requests.length / timing.maxRenderedParticles));
    for (let index = 0; index < state.requests.length; index += stride) {
      const request = state.requests[index];
      const position = getRequestPosition(request, layout);
      let color = colors.blue;
      if (request.retry) {
        color = colors.red;
      } else if (position.phase === "service") {
        color = colors.amber;
      } else if (position.phase === "dependency") {
        color = colors.violet;
      } else if (position.phase === "egress") {
        color = colors.green;
      }

      ctx.save();
      ctx.globalAlpha = position.alpha;
      ctx.fillStyle = `rgb(${color})`;
      ctx.beginPath();
      ctx.arc(position.x, position.y, request.radius, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  }

  function render() {
    const layout = getLayout();
    const stats = getStats();

    drawBackground();
    drawContainers(layout, stats);
    drawParticles(layout);
  }

  function tick(now) {
    const rawDelta = now - state.lastFrameAt;
    const frameDelta = clamp(rawDelta, 0, 100);
    state.lastFrameAt = now;

    if (!state.paused) {
      const simDelta = frameDelta * state.speed;
      state.simTime += simDelta;
      advance(simDelta);
    }

    render();
    requestAnimationFrame(tick);
  }

  bindControls();
  for (const key of Object.keys(controlDefs)) {
    syncControl(key, controlDefs[key].value, { keepRequests: true });
  }
  for (const key of ["retryFixEnabled", "concurrencyLimitEnabled", "memorySheddingEnabled"]) {
    syncToggle(key, state[key]);
  }
  syncSpeed(1);

  const observer = new ResizeObserver(() => {
    resizeCanvas();
    render();
  });
  observer.observe(canvas);
  resizeCanvas();
  rebuildWeights();
  requestAnimationFrame(tick);
})();
