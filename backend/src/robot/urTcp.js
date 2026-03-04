const net = require("net");

function toProgram(script) {
  const text = String(script || "").trim();
  if (!text) {
    throw new Error("Empty URScript");
  }

  //if caller already passed a full URScript program, send as is.
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

//send a URScript string to URSim.
function sendURScript(host, port, script, timeoutMs = 2000) {
  return new Promise((resolve, reject) => {
    const socket = new net.Socket();
    socket.setTimeout(timeoutMs);
    let payload;

    try {
      payload = toProgram(script);
    } catch (e) {
      reject(e);
      return;
    }

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
        resolve({ ok: true, sent: payload.trim(), raw: String(script || "").trim() });
      });
    });
  });
}

module.exports = { sendURScript };
