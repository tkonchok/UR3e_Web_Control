# UR Web Control – Chessboard-Based Robot Interface

## Overview
This project implements a **web-based control framework for a Universal Robots UR3e robot**, designed and tested in **URSim**.
A browser-based UI communicates with a Node.js backend, which sends URScript commands to the simulator.

Features:
- Web-based robot control
- Chessboard square mapping (A1–H8)
- Tic-Tac-Toe mapping (1–9)
- Pick-and-place primitives
- Live robot status feedback
- Dry-run vs live execution

Simulation-first design with a clean path to physical robot deployment.

---

## Requirements
- Node.js v18+
- Docker Desktop
- macOS / Linux (Windows via Docker)

---
<img width="1020" height="636" alt="Screenshot 2026-01-26 at 4 49 49 PM" src="https://github.com/user-attachments/assets/dfe229ad-0d32-4faa-b3da-c1e987790139" />
---
<img width="1265" height="1179" alt="Screenshot 2026-01-26 at 4 50 41 PM" src="https://github.com/user-attachments/assets/768be4bb-4879-4e62-a66f-ffd09bfeccb6" />
---
<img width="1265" height="1179" alt="Screenshot 2026-01-26 at 4 52 38 PM" src="https://github.com/user-attachments/assets/7998857c-6af0-4c6e-9a38-2d92b3e0c665" />
---
## Run Everything (URSim + Backend + UI)

```bash
# 1) Start URSim (UR3e) in Docker
docker run --rm -it \
  --platform linux/amd64 \
  -e ROBOT_MODEL=UR3e \
  -p 5900:5900 \
  -p 30001:30001 \
  -p 30002:30002 \
  -p 30004:30004 \
  -p 6081:6080 \
  -p 29999:29999 \
  --name ur3e_container \
  universalrobots/ursim_e-series

# URSim Teach Pendant:
# http://localhost:6081/vnc.html

# 2) Start Backend
cd backend
npm install
node src/server.js

# 3) Start UI (new terminal)
cd UI
npm install
npm run dev

## Usage
- Select square on board
- Move / Pick / Place
- Toggle Dry Run for safety
