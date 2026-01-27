const net = require("net");

//send a URScript string to URSim.
function sendURScript(host, port, script, timeoutMs = 2000) {
  return new Promise((resolve, reject) => {
    const socket = new net.Socket();
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
      socket.write((script.endsWith("\n") ? script : script + "\n"), "utf8", (err) => {
        if (err) return fail(`Write failed: ${err.message}`);
        cleanup();
        resolve({ ok: true, sent: script.trim() });
      });
    });
  });
}

module.exports = { sendURScript };
