//Backend entrypoint. Mounts API routes and starts background robot connections.
const express = require("express");
const cors = require("cors");
const moveRoutes = require("./routes/move");
const drawRoutes = require("./routes/draw");
const { startRtdeMonitor } = require("./robot/urRtde");
const { warmURScriptConnection } = require("./robot/urTcp");

const app = express();
const PORT = Number(process.env.PORT || 3005);
const UR_HOST = process.env.UR_HOST || "localhost";
const UR_PORT = Number(process.env.UR_PORT || 30002);
const WARM_UR_SOCKET = process.env.WARM_URSCRIPT_SOCKET !== "0";

app.use(cors());
app.use(express.json({ limit: "20mb" }));

app.get("/health", (req, res) => res.json({ ok: true }));
app.use("/api", moveRoutes);
app.use("/api/draw", drawRoutes);

startRtdeMonitor();
if (WARM_UR_SOCKET) {
  warmURScriptConnection(UR_HOST, UR_PORT).catch((e) => {
    console.warn(`[urTcp] warm-up failed: ${e.message}`);
  });
}

app.listen(PORT, () => console.log(`Backend on http://localhost:${PORT}`));
