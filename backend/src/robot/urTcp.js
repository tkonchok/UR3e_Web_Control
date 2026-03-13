//URScript transport layer. Supports one-shot sends or a warmed persistent socket.
const net = require("net");
const clients = new Map();
const PERSISTENT_SOCKET = process.env.UR_PERSISTENT_SOCKET !== "0";

function toProgram(script) {
  const text = String(script || "").trim();
  if (!text) {
    throw new Error("Empty URScript");
  }

  //If the caller already passed a full URScript program, send it as-is.
  if (/^\s*def\s+\w+\s*\(/.test(text)) {
    return text.endsWith("\n") ? text : `${text}\n`;
  }

  const lines = text
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);

  const body = lines.map((l) => `  ${l}`).join("\n");
  return `def web_cmd():\n${body}\nend\n`;
}

function getClientKey(host, port) {
  return `${host}:${port}`;
}

function getClient(host, port) {
  const key = getClientKey(host, port);
  let client = clients.get(key);
  if (!client) {
    client = {
      key,
      host,
      port,
      socket: null,
      connectPromise: null,
      queue: Promise.resolve(),
    };
    clients.set(key, client);
  }
  return client;
}

function clearClientSocket(client, socketRef = null) {
  if (!client) return;
  if (socketRef && client.socket && client.socket !== socketRef) return;
  const s = socketRef || client.socket;
  if (s) {
    try { s.destroy(); } catch {}
  }
  if (!socketRef || client.socket === socketRef) {
    client.socket = null;
  }
  client.connectPromise = null;
}

function connectPersistent(client, timeoutMs) {
  if (client.socket && !client.socket.destroyed) {
    return Promise.resolve(client.socket);
  }
  if (client.connectPromise) {
    return client.connectPromise;
  }

  client.connectPromise = new Promise((resolve, reject) => {
    const socket = new net.Socket();
    let settled = false;
    let timer = null;

    const done = (err) => {
      if (settled) return;
      settled = true;
      if (timer) clearTimeout(timer);
      if (err) {
        clearClientSocket(client, socket);
        reject(err);
        return;
      }
      client.socket = socket;
      resolve(socket);
    };

    timer = setTimeout(() => {
      done(new Error(`Timeout connecting to ${client.host}:${client.port} after ${timeoutMs}ms`));
    }, timeoutMs);

    socket.setNoDelay(true);
    socket.setKeepAlive(true, 1000);
    socket.once("error", (e) => done(new Error(`Socket error: ${e.message}`)));
    socket.connect(client.port, client.host, () => {
      socket.removeAllListeners("error");
      socket.on("error", () => clearClientSocket(client, socket));
      socket.on("close", () => clearClientSocket(client, socket));
      done(null);
    });
  });

  return client.connectPromise.finally(() => {
    client.connectPromise = null;
  });
}

function writePayload(socket, payload, timeoutMs) {
  return new Promise((resolve, reject) => {
    let done = false;
    const timer = setTimeout(() => {
      if (done) return;
      done = true;
      reject(new Error(`Timeout writing URScript after ${timeoutMs}ms`));
    }, timeoutMs);

    socket.write(payload, "utf8", (err) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      if (err) {
        reject(new Error(`Write failed: ${err.message}`));
        return;
      }
      resolve();
    });
  });
}

function sendOneShot(host, port, payload, rawScript, timeoutMs) {
  return new Promise((resolve, reject) => {
    const socket = new net.Socket();
    socket.setNoDelay(true);
    socket.setTimeout(timeoutMs);

    const cleanup = () => {
      socket.removeAllListeners();
      socket.destroy();
    };

    const fail = (msg) => {
      cleanup();
      reject(new Error(msg));
    };

    socket.on("timeout", () => fail(`Timeout after ${timeoutMs}ms`));
    socket.on("error", (e) => fail(`Socket error: ${e.message}`));
    
    socket.connect(port, host, () => {
      socket.write(payload, "utf8", (err) => {
        if (err) return fail(`Write failed: ${err.message}`);
        cleanup();
        resolve({ ok: true, sent: payload.trim(), raw: rawScript });
      });
    });
  });
}

function sendPersistent(host, port, payload, rawScript, timeoutMs) {
  const client = getClient(host, port);
  const task = async () => {
    const socket = await connectPersistent(client, timeoutMs);
    try {
      await writePayload(socket, payload, timeoutMs);
    } catch (e) {
      clearClientSocket(client, socket);
      throw e;
    }
    return { ok: true, sent: payload.trim(), raw: rawScript };
  };
  //Serialize writes per socket so overlapping commands do not corrupt each other.
  const run = client.queue.then(task, task);
  client.queue = run.catch(() => {});
  return run;
}

//Main entry for sending a URScript snippet to URSim or the physical controller.
function sendURScript(host, port, script, timeoutMs = 2000) {
  let payload;
  try {
    payload = toProgram(script);
  } catch (e) {
    return Promise.reject(e);
  }
  const rawScript = String(script || "").trim();

  if (PERSISTENT_SOCKET) {
    return sendPersistent(host, port, payload, rawScript, timeoutMs);
  }
  return sendOneShot(host, port, payload, rawScript, timeoutMs);
}

async function warmURScriptConnection(host, port, timeoutMs = 1200) {
  if (!PERSISTENT_SOCKET) {
    return { ok: false, skipped: true, reason: "persistent_socket_disabled" };
  }
  const client = getClient(host, port);
  await connectPersistent(client, timeoutMs);
  return { ok: true, host, port };
}

module.exports = { sendURScript, warmURScriptConnection };
