const express = require("express");
const cors = require("cors");
const moveRoutes = require("./routes/move");

const app = express();
app.use(cors());
app.use(express.json());

app.get("/health", (req, res) => res.json({ ok: true }));
app.use("/api", moveRoutes);

app.listen(3005, () => console.log("Backend on http://localhost:3005"));
