# UR3e Web Control

## Overview
This project is a web-based control system for a Universal Robots UR3e arm, developed and tested in URSim first, then prepared for physical deployment.

The frontend sends commands to a Node.js backend, which generates URScript and dispatches it to URSim or UR robot controllers.

Additional review docs:
- `docs/ARCHITECTURE_OVERVIEW.md`

---
<img width="1020" height="636" alt="Screenshot 2026-01-26 at 4 49 49 PM" src="https://github.com/user-attachments/assets/dfe229ad-0d32-4faa-b3da-c1e987790139" />

---

## Current Features
- Chess mode:
  - Square mapping (`A1-H8`)
  - Move-to-square
  - Suction pick and suction place

---
<img width="1043" height="652" alt="Screenshot 2026-03-04 at 8 24 06 PM" src="https://github.com/user-attachments/assets/9f6d171e-7a8d-4139-9445-6dd69d40f3b0" />

---

- Tic-Tac-Toe mode:
  - Cell mapping (`1-9`)
  - Move-to-cell
  - Mark `X` / `O` trajectories

---
<img width="1043" height="652" alt="Screenshot 2026-03-04 at 8 24 37 PM" src="https://github.com/user-attachments/assets/25ce2d28-bddd-4413-8e01-fd33fcfb668b" />

---

- Whiteboard mode:
  - PNG/JPG image upload
  - OpenCV vectorization pipeline (Python)
  - Drawing preview before execution
  - Execute draw and stop draw
  - ETA estimate for drawing jobs

---
<img width="1083" height="711" alt="Screenshot 2026-03-04 at 8 25 25 PM" src="https://github.com/user-attachments/assets/77445521-5887-4aab-b382-cb4bf901d6e0" />

---

- System behavior:
  - Dry-run mode (generate scripts without movement)
  - RTDE-based live movement status
  - Control lock token to prevent multi-client conflicts
  - Calibration profiles for board and whiteboard placement
  - Safety limits on draw complexity

## Architecture Summary
- Frontend: `UI/src/App.tsx` (top-level state, API calls, mode switching)
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
- Git
- macOS/Linux recommended
- Windows works with Docker Desktop + Python setup

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
macOS / Linux:
```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate
python3 -m pip install --upgrade pip
npm install
python3 -m pip install -r requirements-draw.txt
npm start
```

Windows PowerShell:
```powershell
cd backend
py -3 -m venv .venv
.venv\Scripts\activate
py -3 -m pip install --upgrade pip
npm install
py -3 -m pip install -r requirements-draw.txt
npm start
```

Optional backend config:
```bash
cp .env.example .env
```

### 3) Install and Run UI
```bash
cd UI
npm install
npm run dev
```

### 4) Open the UI
- Vite usually starts at `http://localhost:5173`

## Backend Environment Variables
Common variables:
- `PORT` (default `3005`)
- `UR_HOST` (default `localhost`)
- `UR_PORT` (default `30002`)

Status / telemetry:
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
To see real robot or URSim motion, make sure `Dry Run` is OFF.
When `Dry Run` is ON, the backend still generates scripts, but the robot does not move.

### Chess Mode
1. Select target square.
2. Click `Move to Square`.
3. Click `Pick` to enable suction or `Place` to disable suction.
4. Use dry-run first if you want to verify the generated script without motion.

### Tic-Tac-Toe Mode
1. Select cell.
2. Click `Move to Square`.
3. Click `Mark` to draw `X` or `O`.

### Whiteboard Mode
1. Upload a PNG/JPG image.
2. Start with the `balanced` preset.
3. Click `Plan Preview`.
4. Check safety status and preview shape.
5. Click `Execute Draw` when the preview looks correct.
6. Use `Stop Robot` if needed.

## Sample Whiteboard Inputs
These sample images are included in the repo for quick reviewer testing:
- `docs/sample-images/sample1.jpg`
- `docs/sample-images/sample2.png`
- `docs/sample-images/sample3.png`

Suggested use:
1. Start with `sample2.png` or `sample3.png` for a cleaner first preview.
2. Use `sample1.jpg` after the basic preview flow is working.

## Vectorization Tuning Guide
Whiteboard mode converts a raster image into contour strokes before planning robot motion. The preview quality depends on the input image and the tuning values.

Recommended workflow:
1. Use a clean high-contrast PNG/JPG.
2. Start with the `balanced` preset.
3. Click `Plan Preview`.
4. Only open advanced tuning if the preview is clearly wrong or too noisy.

### Parameter Reference

#### `cannyLow` / `cannyHigh`
These control edge sensitivity when edge-based extraction is used.
- Lower values: more edges, more noise
- Higher values: fewer edges, cleaner boundaries

Use them when:
- edges are missing -> lower them slightly
- too many extra lines appear -> raise them slightly

#### `minPerimeterPx`
Minimum contour size in pixels.
- Lower values: keep more detail and more noise
- Higher values: remove noise, but small features may disappear

Use it when:
- tiny junk contours appear -> increase it
- inner details or small letters are missing -> decrease it

#### `approxEpsilonFrac`
Controls contour simplification strength.
- Lower values: more points, closer to original shape
- Higher values: fewer points, smoother but less accurate shape

Use it when:
- curves look blocky -> lower it
- preview is too dense -> raise it a little

#### `maxContours`
Maximum number of contours kept.
- Lower values: simpler plan, less detail
- Higher values: more detail, more complexity

Use it when:
- the main outline is enough -> lower it
- important details are getting dropped -> raise it

#### `maxDim`
Maximum image size used during processing.
- Lower values: faster preview, less detail
- Higher values: more detail, more compute time

Use it when:
- preview is too coarse -> raise it
- you want faster rough previews -> lower it

#### `blurKsize`
Amount of blur before contour extraction.
- Lower values: sharper edges, more noise
- Higher values: smoother edges, less detail

Use it when:
- the image has noisy texture -> increase it
- thin details disappear -> decrease it

#### `padding`
Margin between the drawing and the whiteboard edges.
- Lower values: drawing fills more of the board
- Higher values: drawing stays farther from the edges

Use it when:
- preview looks too small -> lower it
- you want more margin -> raise it

#### `simplifyEpsilon`
Extra planner-side stroke simplification after vectorization.
- Lower values: more fidelity, more points
- Higher values: fewer points, simpler motion

Use it when:
- shape loses too much detail -> lower it
- plan is too dense -> raise it

#### `minStep`
Removes tiny step-to-step jitter after simplification.
- Lower values: keep more fine movement
- Higher values: remove more tiny wiggles

Use it when:
- preview looks shaky or noisy -> raise it
- very fine detail is missing -> lower it

### Practical Tuning Patterns
If the preview is too noisy:
- raise `minPerimeterPx`
- raise `approxEpsilonFrac`
- raise `blurKsize`

If the preview is missing detail:
- lower `minPerimeterPx`
- lower `approxEpsilonFrac`
- raise `maxContours`
- raise `maxDim`

If the preview looks good but the plan is too dense:
- raise `simplifyEpsilon`
- raise `minStep`

### Best Input Images
Good inputs:
- high contrast
- plain background
- solid logos or bold text
- minimal shadows or texture

Poor inputs:
- photographs with busy backgrounds
- low-contrast screenshots
- tiny thin-line images with compression artifacts

## Notes
- SVG/text direct draw input is currently disabled; image input is the supported path.
- Preview first, then execute, especially for high-detail images.
- Best results come from high-contrast images with simple backgrounds.
- Calibration quality directly affects physical drawing and pick accuracy.
- ETA is an estimate based on planned path length and configured speeds. It does not yet exactly match real robot execution time.
