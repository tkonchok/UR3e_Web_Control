const express = require("express");
const cors = require("cors");
const moveRoutes = require("./routes/move");

const app = express();
const PORT = Number(process.env.PORT || 3005);

app.use(cors());
app.use(express.json());

app.get("/health", (req, res) => res.json({ ok: true }));
app.use("/api", moveRoutes);

app.listen(PORT, () => console.log(`Backend on http://localhost:${PORT}`));
