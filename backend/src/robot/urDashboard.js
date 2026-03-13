//small dashboard client used as a fallback status source when RTDE is unavailable.
const net = require("net");

function sendDashboard(cmd, host = "localhost", port = 29999, timeoutMs = 800) {
  return new Promise((resolve, reject) => {
    const socket = new net.Socket();
    let buf = "";

    const done = (err, value) => {
      try { socket.destroy(); } catch {}
      if (err) reject(err);
      else resolve(value);
    };

    socket.setTimeout(timeoutMs);

    socket.on("data", (chunk) => {
      buf += chunk.toString("utf8");
      if (buf.includes("\n")) {
        const lines = buf.split("\n").map(s => s.trim()).filter(Boolean);
        done(null, lines[lines.length - 1] || "");
      }
    });

    socket.on("timeout", () => done(new Error("Dashboard timeout")));
    socket.on("error", (e) => done(e));

    socket.connect(port, host, () => {
      socket.write(cmd.trim() + "\n");
    });
  });
}

async function getRobotStatus(host = "localhost", port = 29999) {
  const [robotmode, safetystatus, running, programState] = await Promise.allSettled([
    sendDashboard("robotmode", host, port),
    sendDashboard("safetystatus", host, port),
    sendDashboard("running", host, port),
    sendDashboard("programState", host, port),
  ]);

  const pick = (p) => (p.status === "fulfilled" ? p.value : null);

  return {
    robotmode: pick(robotmode),
    safetystatus: pick(safetystatus),
    running: pick(running),
    programState: pick(programState),
  };
}

module.exports = { sendDashboard, getRobotStatus };
