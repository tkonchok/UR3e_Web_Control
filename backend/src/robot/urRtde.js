const net = require("net");

const CMD_REQUEST_PROTOCOL_VERSION = "V".charCodeAt(0); // 86
const CMD_GET_URCONTROL_VERSION = "v".charCodeAt(0); // 118
const CMD_TEXT_MESSAGE = "M".charCodeAt(0); // 77
const CMD_DATA_PACKAGE = "U".charCodeAt(0); // 85
const CMD_SETUP_OUTPUTS = "O".charCodeAt(0); // 79
const CMD_START = "S".charCodeAt(0); // 83

function buildPacket(type, payload = Buffer.alloc(0)) {
  const total = 3 + payload.length;
  const buf = Buffer.alloc(total);
  buf.writeUInt16BE(total, 0);
  buf.writeUInt8(type, 2);
  if (payload.length) payload.copy(buf, 3);
  return buf;
}

function parseDataByType(type, buf, offset) {
  switch (type) {
    case "BOOL":
    case "UINT8":
      if (offset + 1 > buf.length) return null;
      return { value: buf.readUInt8(offset), next: offset + 1 };
    case "UINT32":
      if (offset + 4 > buf.length) return null;
      return { value: buf.readUInt32BE(offset), next: offset + 4 };
    case "INT32":
      if (offset + 4 > buf.length) return null;
      return { value: buf.readInt32BE(offset), next: offset + 4 };
    case "UINT64":
      if (offset + 8 > buf.length) return null;
      return { value: Number(buf.readBigUInt64BE(offset)), next: offset + 8 };
    case "DOUBLE":
      if (offset + 8 > buf.length) return null;
      return { value: buf.readDoubleBE(offset), next: offset + 8 };
    case "VECTOR3D": {
      if (offset + 24 > buf.length) return null;
      return {
        value: [
          buf.readDoubleBE(offset),
          buf.readDoubleBE(offset + 8),
          buf.readDoubleBE(offset + 16),
        ],
        next: offset + 24,
      };
    }
    case "VECTOR6D": {
      if (offset + 48 > buf.length) return null;
      return {
        value: [
          buf.readDoubleBE(offset),
          buf.readDoubleBE(offset + 8),
          buf.readDoubleBE(offset + 16),
          buf.readDoubleBE(offset + 24),
          buf.readDoubleBE(offset + 32),
          buf.readDoubleBE(offset + 40),
        ],
        next: offset + 48,
      };
    }
    case "VECTOR6INT32": {
      if (offset + 24 > buf.length) return null;
      return {
        value: [
          buf.readInt32BE(offset),
          buf.readInt32BE(offset + 4),
          buf.readInt32BE(offset + 8),
          buf.readInt32BE(offset + 12),
          buf.readInt32BE(offset + 16),
          buf.readInt32BE(offset + 20),
        ],
        next: offset + 24,
      };
    }
    case "VECTOR6UINT32": {
      if (offset + 24 > buf.length) return null;
      return {
        value: [
          buf.readUInt32BE(offset),
          buf.readUInt32BE(offset + 4),
          buf.readUInt32BE(offset + 8),
          buf.readUInt32BE(offset + 12),
          buf.readUInt32BE(offset + 16),
          buf.readUInt32BE(offset + 20),
        ],
        next: offset + 24,
      };
    }
    default:
      return null;
  }
}

function magnitude(v) {
  if (!Array.isArray(v)) return 0;
  let s = 0;
  for (const n of v) s += Number(n || 0) * Number(n || 0);
  return Math.sqrt(s);
}

function maxAbs(v) {
  if (!Array.isArray(v) || !v.length) return 0;
  let m = 0;
  for (const n of v) {
    const a = Math.abs(Number(n || 0));
    if (a > m) m = a;
  }
  return m;
}

class URRtdeMonitor {
  constructor({
    host = "localhost",
    port = 30004,
    frequency = 25,
    reconnectMs = 1500,
    protocolVersion = 2,
    staleMs = 2000,
    speedStartEps = 0.002,
    speedStopEps = 0.0008,
    jointSpeedStartEps = 0.01,
    jointSpeedStopEps = 0.004,
    movingHoldMs = 250,
    fields = [
      "timestamp",
      "actual_TCP_speed",
      "actual_qd",
      "runtime_state",
      "robot_mode",
      "safety_mode",
    ],
  } = {}) {
    this.host = host;
    this.port = Number(port);
    this.frequency = Number(frequency);
    this.reconnectMs = Number(reconnectMs);
    this.protocolVersion = Number(protocolVersion);
    this.staleMs = Number(staleMs);
    this.speedStartEps = Number(speedStartEps);
    this.speedStopEps = Number(speedStopEps);
    this.jointSpeedStartEps = Number(jointSpeedStartEps);
    this.jointSpeedStopEps = Number(jointSpeedStopEps);
    this.movingHoldMs = Number(movingHoldMs);
    this.fields = Array.from(fields);

    this.socket = null;
    this.rx = Buffer.alloc(0);
    this.waiters = [];
    this.connected = false;
    this.connecting = false;
    this.recipeId = 0;
    this.recipeTypes = [];
    this.reconnectTimer = null;
    this.lastMotionAt = 0;

    this.state = {
      connected: false,
      moving: false,
      updatedAt: 0,
      stale: true,
      source: "rtde",
      runtimeState: null,
      speedMagnitude: 0,
      tcpSpeed: [0, 0, 0, 0, 0, 0],
      jointSpeedMax: 0,
      robotMode: null,
      safetyMode: null,
      error: null,
    };
  }

  getStatus() {
    const now = Date.now();
    const ageMs = this.state.updatedAt ? now - this.state.updatedAt : null;
    const stale = !this.state.updatedAt || ageMs > this.staleMs;
    return {
      ...this.state,
      ageMs,
      stale,
      connected: this.connected && !stale,
    };
  }

  start() {
    this._ensureConnected();
  }

  stop() {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this._disconnect();
  }

  _setError(message) {
    this.state.error = String(message || "unknown");
  }

  _scheduleReconnect() {
    if (this.reconnectTimer) return;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this._ensureConnected();
    }, this.reconnectMs);
  }

  _disconnect() {
    this.connected = false;
    this.connecting = false;
    this.recipeId = 0;
    this.recipeTypes = [];
    if (this.socket) {
      try {
        this.socket.destroy();
      } catch {}
      this.socket = null;
    }
    while (this.waiters.length) {
      const w = this.waiters.shift();
      clearTimeout(w.timer);
      w.reject(new Error("RTDE disconnected"));
    }
    this.state.connected = false;
    this.state.moving = false;
  }

  _handlePackage(type, payload) {
    for (let i = 0; i < this.waiters.length; i += 1) {
      const w = this.waiters[i];
      if (w.type === type) {
        this.waiters.splice(i, 1);
        clearTimeout(w.timer);
        w.resolve({ type, payload });
        return;
      }
    }

    if (type === CMD_DATA_PACKAGE) {
      this._handleDataPackage(payload);
    } else if (type === CMD_TEXT_MESSAGE) {
      this._setError(`RTDE text message: ${payload.toString("utf8")}`);
    }
  }

  _onData(chunk) {
    this.rx = Buffer.concat([this.rx, chunk]);
    while (this.rx.length >= 3) {
      const size = this.rx.readUInt16BE(0);
      if (size < 3 || size > 10000) {
        this._setError(`RTDE invalid packet size: ${size}`);
        this._disconnect();
        this._scheduleReconnect();
        return;
      }
      if (this.rx.length < size) return;
      const type = this.rx.readUInt8(2);
      const payload = this.rx.subarray(3, size);
      this.rx = this.rx.subarray(size);
      this._handlePackage(type, payload);
    }
  }

  _waitForType(type, timeoutMs = 1500) {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.waiters = this.waiters.filter((w) => w.timer !== timer);
        reject(new Error(`RTDE timeout waiting for packet type ${type}`));
      }, timeoutMs);
      this.waiters.push({ type, resolve, reject, timer });
    });
  }

  _send(type, payload) {
    if (!this.socket) throw new Error("RTDE socket not connected");
    this.socket.write(buildPacket(type, payload));
  }

  async _connectAndSetup() {
    if (this.connecting || this.connected) return;
    this.connecting = true;
    this.state.error = null;

    const socket = new net.Socket();
    this.socket = socket;
    socket.setNoDelay(true);

    await new Promise((resolve, reject) => {
      const onErr = (e) => reject(e);
      socket.once("error", onErr);
      socket.connect(this.port, this.host, () => {
        socket.off("error", onErr);
        resolve();
      });
    });

    socket.on("data", (chunk) => this._onData(chunk));
    socket.on("error", (e) => {
      this._setError(`RTDE socket error: ${e.message}`);
      this._disconnect();
      this._scheduleReconnect();
    });
    socket.on("close", () => {
      this._disconnect();
      this._scheduleReconnect();
    });

    const reqV = Buffer.alloc(2);
    reqV.writeUInt16BE(this.protocolVersion, 0);
    this._send(CMD_REQUEST_PROTOCOL_VERSION, reqV);
    const vResp = await this._waitForType(CMD_REQUEST_PROTOCOL_VERSION, 2000);
    if (!vResp.payload.length || vResp.payload.readUInt8(0) !== 1) {
      throw new Error(`RTDE protocol v${this.protocolVersion} not accepted`);
    }

    this._send(CMD_GET_URCONTROL_VERSION, Buffer.alloc(0));
    await this._waitForType(CMD_GET_URCONTROL_VERSION, 2000).catch(() => null);

    const fieldsCsv = this.fields.join(",");
    const fieldsBuf = Buffer.from(fieldsCsv, "ascii");
    const setupPayload = Buffer.alloc(8 + fieldsBuf.length);
    setupPayload.writeDoubleBE(this.frequency, 0);
    fieldsBuf.copy(setupPayload, 8);
    this._send(CMD_SETUP_OUTPUTS, setupPayload);

    const setupResp = await this._waitForType(CMD_SETUP_OUTPUTS, 2000);
    if (!setupResp.payload.length) {
      throw new Error("RTDE setup outputs failed: empty response");
    }
    const recipeId = setupResp.payload.readUInt8(0);
    const typeCsv = setupResp.payload.subarray(1).toString("ascii").trim();
    const recipeTypes = typeCsv ? typeCsv.split(",") : [];
    if (!recipeId) {
      throw new Error(`RTDE output recipe rejected: ${typeCsv || "recipe id 0"}`);
    }
    if (recipeTypes.length !== this.fields.length) {
      throw new Error(`RTDE setup type count mismatch (${recipeTypes.length} vs ${this.fields.length})`);
    }
    if (recipeTypes.some((t) => t === "NOT_FOUND")) {
      throw new Error(`RTDE output field not found: ${typeCsv}`);
    }

    this.recipeId = recipeId;
    this.recipeTypes = recipeTypes;

    this._send(CMD_START, Buffer.alloc(0));
    const startResp = await this._waitForType(CMD_START, 2000);
    if (!startResp.payload.length || startResp.payload.readUInt8(0) !== 1) {
      throw new Error("RTDE start rejected");
    }

    this.connected = true;
    this.connecting = false;
    this.state.connected = true;
    this.state.error = null;
  }

  _handleDataPackage(payload) {
    if (!payload.length) return;
    const recipeId = payload.readUInt8(0);
    if (!this.recipeId || recipeId !== this.recipeId) return;

    let off = 1;
    const values = {};
    for (let i = 0; i < this.fields.length; i += 1) {
      const field = this.fields[i];
      const type = this.recipeTypes[i];
      const parsed = parseDataByType(type, payload, off);
      if (!parsed) {
        this._setError(`RTDE parse failed for ${field}:${type}`);
        return;
      }
      values[field] = parsed.value;
      off = parsed.next;
    }

    const tcp = Array.isArray(values.actual_TCP_speed) ? values.actual_TCP_speed : [0, 0, 0, 0, 0, 0];
    const speedMag = magnitude(tcp);
    const qd = Array.isArray(values.actual_qd) ? values.actual_qd : [0, 0, 0, 0, 0, 0];
    const jointSpeedMax = maxAbs(qd);
    const runtimeState = Number(values.runtime_state ?? 0);
    const now = Date.now();

    const aboveStart =
      speedMag >= this.speedStartEps || jointSpeedMax >= this.jointSpeedStartEps;
    const belowStop =
      speedMag <= this.speedStopEps && jointSpeedMax <= this.jointSpeedStopEps;

    if (aboveStart) this.lastMotionAt = now;

    let moving = this.state.moving;
    if (aboveStart) {
      moving = true;
    } else if (belowStop) {
      const recentMotion = this.lastMotionAt && now - this.lastMotionAt <= this.movingHoldMs;
      moving = !!recentMotion;
    }

    this.state.connected = true;
    this.state.moving = !!moving;
    this.state.updatedAt = now;
    this.state.runtimeState = runtimeState;
    this.state.speedMagnitude = speedMag;
    this.state.tcpSpeed = tcp;
    this.state.jointSpeedMax = jointSpeedMax;
    this.state.robotMode = values.robot_mode ?? null;
    this.state.safetyMode = values.safety_mode ?? null;
    this.state.error = null;
  }

  async _ensureConnected() {
    if (this.connected || this.connecting) return;
    try {
      await this._connectAndSetup();
    } catch (e) {
      this._setError(e.message || String(e));
      this._disconnect();
      this._scheduleReconnect();
    }
  }
}

const ENABLE_RTDE_STATUS = process.env.ENABLE_RTDE_STATUS !== "0";
const monitor = new URRtdeMonitor({
  host: process.env.UR_RTDE_HOST || process.env.UR_HOST || "localhost",
  port: Number(process.env.UR_RTDE_PORT || 30004),
  frequency: Number(process.env.UR_RTDE_FREQ || 25),
  reconnectMs: Number(process.env.UR_RTDE_RECONNECT_MS || 1500),
  speedStartEps: Number(process.env.UR_RTDE_SPEED_START_EPS || 0.002),
  speedStopEps: Number(process.env.UR_RTDE_SPEED_STOP_EPS || 0.0008),
  jointSpeedStartEps: Number(process.env.UR_RTDE_JOINT_SPEED_START_EPS || 0.01),
  jointSpeedStopEps: Number(process.env.UR_RTDE_JOINT_SPEED_STOP_EPS || 0.004),
  movingHoldMs: Number(process.env.UR_RTDE_MOVING_HOLD_MS || 250),
});

function getRtdeStatus() {
  return monitor.getStatus();
}

function startRtdeMonitor() {
  if (!ENABLE_RTDE_STATUS) return;
  monitor.start();
}

module.exports = {
  getRtdeStatus,
  startRtdeMonitor,
};
