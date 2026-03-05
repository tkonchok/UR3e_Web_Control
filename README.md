# UR3e Web Control

## Overview
This project is a web-based control system for a Universal Robots UR3e arm, developed and tested in URSim first, then prepared for physical deployment.

The frontend sends commands to a Node.js backend, which generates URScript and dispatches it to URSim/robot controllers.

## Current Features
- Chess mode:
  - Square mapping (A1-H8)
  - Move-to-square
  - Suction pick and suction place
- Tic-Tac-Toe mode:
  - Cell mapping (1-9)
  - Move-to-cell
  - Mark X/O trajectories
- Whiteboard mode:
  - PNG/JPG image upload
  - OpenCV vectorization pipeline (Python)
  - Drawing preview before execution
  - Execute draw and stop draw
  - ETA estimate for drawing jobs
- System behavior:
  - Dry-run mode (generate scripts without movement)
  - RTDE-based live movement status
  - Control lock token to prevent multi-client conflicts
  - Calibration profiles for board/whiteboard placement
  - Safety limits on draw complexity

## Architecture Summary
- Frontend: `UI/src/App.tsx` (mode controls, payload generation, status display)
- Backend entry: `backend/src/server.js`
- Motion API: `backend/src/routes/move.js`
- Draw API: `backend/src/routes/draw.js`
- Board calibration: `backend/src/robot/squares.js`
- Whiteboard calibration: `backend/src/robot/whiteboard.js`
- URScript transport: `backend/src/robot/urTcp.js`
- RTDE status monitor: `backend/src/robot/urRtde.js`
- OpenCV vectorization: `backend/src/draw/vectorize_opencv.py`
- Planner/simplifier: `backend/src/draw/planner.js`

## Requirements
- Node.js v18+
- Python 3.10+ (for draw vectorization)
- Docker Desktop (for URSim)
- macOS/Linux (Windows works with Docker + Python setup)

Python packages:
- `opencv-python-headless>=4.10.0`
- `numpy>=1.26.0`

## Setup and Run

### 1) Start URSim (UR3e) in Docker
```bash
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
```

URSim pendant:
- `http://localhost:6081/vnc.html`

### 2) Install and Run Backend
```bash
cd backend
npm install
python3 -m pip install -r requirements-draw.txt
node src/server.js
```

### 3) Install and Run UI
```bash
cd UI
npm install
npm run dev
```

## Backend Environment Variables
Common variables:
- `PORT` (default `3005`)
- `UR_HOST` (default `localhost`)
- `UR_PORT` (default `30002`)

Status/telemetry:
- `ENABLE_RTDE_STATUS` (default `1`)
- `UR_RTDE_PORT` (default `30004`)
- `ENABLE_DASHBOARD_STATUS` (default `1`)
- `UR_DASHBOARD_PORT` (default `29999`)

URScript socket behavior:
- `UR_PERSISTENT_SOCKET` (default `1`)
- `WARM_URSCRIPT_SOCKET` (default `1`)

Drawing controls:
- `DRAW_PEN_UP_D`
- `DRAW_PEN_DOWN_D`
- `DRAW_LINE_V`, `DRAW_LINE_A`
- `DRAW_TRAVEL_V`, `DRAW_TRAVEL_A`
- `DRAW_MAX_STROKES`
- `DRAW_MAX_POINTS`
- `DRAW_MAX_PATH_M`
- `DRAW_MAX_SCRIPT_LINES`

Calibration profile defaults:
- `BOARD_PROFILE` (`table_front` or `wall_front`)
- `WHITEBOARD_PROFILE` (`wall_default` or `table_marker`)

## Usage

### Chess Mode
1. Select target square.
2. Move to square.
3. Pick to enable suction or Place to disable suction.
4. Use dry-run to verify scripts first.

### Tic-Tac-Toe Mode
1. Select cell.
2. Move to cell.
3. Mark X or O.

### Whiteboard Mode
1. Upload a PNG/JPG image.
2. Pick quality preset and tuning values.
3. Click Preview to inspect stroke plan.
4. Click Execute Draw when safety status is OK.
5. Use Stop Draw if needed.

## Notes
- SVG/text direct draw input is currently disabled; image input is the supported path.
- Preview first, then execute, especially for high-detail images.
- Best results come from high-contrast images with simple backgrounds.
- Calibration quality directly affects physical drawing/pick accuracy.
