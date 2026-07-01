# UR3e Web Control

## Overview
UR3e Web Control is a simulator-first web platform for structured UR3e interaction. It exposes three task modes through one browser dashboard:
- chess-style board movement and suction-based pick/place
- tic-tac-toe movement and pen-based X/O marking
- whiteboard drawing from uploaded PNG/JPG images

The system combines a React frontend, a Node.js/Express backend, calibrated workspace mapping, URScript generation, RTDE-based status monitoring, and an OpenCV drawing pipeline. Development and validation were performed in URSim, with the code organized so the same control path can later be retargeted to physical hardware after calibration and tool validation.

Additional docs:
- `docs/ARCHITECTURE_OVERVIEW.md`
- `Tenzin_Senior_Project_Report_Final.pdf`

---
<img width="1020" height="636" alt="Main UI" src="https://github.com/user-attachments/assets/dfe229ad-0d32-4faa-b3da-c1e987790139" />

---

## Problem Statement
Universal Robots exposes low-level interfaces such as URScript, RTDE, and dashboard control, but those interfaces alone do not provide a task-level workflow for structured interaction modes such as board manipulation or image-driven drawing. The engineering problem addressed by this project is how to translate user-level inputs like chess squares, tic-tac-toe cells, and uploaded raster images into calibrated robot actions while keeping execution safe, observable, and practical for simulator-based development.

## Objectives and Scope
### Objectives
- provide a browser-based control panel for the UR3e
- map chess squares and tic-tac-toe cells into calibrated robot poses
- support chess-style suction pick/place and tic-tac-toe pen marking
- support whiteboard drawing from uploaded PNG/JPG images
- provide dry-run, control locking, safety checks, and live motion status
- keep the workflow usable in URSim as the primary validation environment

### Success Criteria
- board targets resolve into calibrated poses and executable URScript
- whiteboard images can be previewed, checked, and executed as stroke plans
- UI status tracks robot motion more accurately than fixed timing alone
- drawing jobs that exceed stroke, point, path-length, or script-line limits are rejected before execution

### Included Scope
- React + TypeScript dashboard
- Node.js + Express API server
- board and whiteboard calibration profiles
- URScript generation and TCP dispatch
- RTDE-based motion monitoring with dashboard fallback
- OpenCV contour extraction and stroke planning
- simulator-based validation in URSim

### Excluded Scope
- full physical robot validation
- automatic calibration
- closed-loop camera correction
- arbitrary SVG/text drawing workflows
- exact real-world ETA prediction

## Current Features
### Chess Mode
- square mapping (`A1-H8`)
- move-to-square
- suction pick and suction place
- UI chess-piece state tracking during pick/place flow

---
<img width="1043" height="652" alt="Chess mode" src="https://github.com/user-attachments/assets/9f6d171e-7a8d-4139-9445-6dd69d40f3b0" />

---

### Tic-Tac-Toe Mode
- cell mapping (`1-9`)
- move-to-cell
- robot-side `X` / `O` marking trajectories with pen tool

---
<img width="1043" height="652" alt="Tic-tac-toe mode" src="https://github.com/user-attachments/assets/25ce2d28-bddd-4413-8e01-fd33fcfb668b" />

---

### Whiteboard Mode
- PNG/JPG image upload
- OpenCV contour extraction pipeline (Python)
- preview-before-execute workflow
- execute draw and stop draw routes
- ETA estimate for drawing jobs

---
<img width="1083" height="711" alt="Whiteboard mode" src="https://github.com/user-attachments/assets/77445521-5887-4aab-b382-cb4bf901d6e0" />

---

### Shared Control Features
- dry-run mode for script generation without robot motion
- control lock token to prevent multi-client conflicts
- calibration profiles for board and whiteboard setups
- RTDE-based live movement status
- safety limits on drawing complexity

## Implementation Map
### Frontend
- `UI/src/App.tsx`
  - top-level state, API dispatch, mode switching, status polling
- `UI/src/components/AppHeader.tsx`
  - global controls such as dry-run and connection/status indicators
- `UI/src/components/WorkspaceBoard.tsx`
  - board rendering and target interaction
- `UI/src/components/CommandControls.tsx`
  - chess, tic-tac-toe, and draw action controls
- `UI/src/components/RobotStatusSidebar.tsx`
  - status, ETA, profile, and safety display
- `UI/src/config/draw.ts`
  - preset tuning bundles for the draw pipeline

### Backend
- `backend/src/server.js`
  - Express entry point, route registration, RTDE monitor startup
- `backend/src/routes/move.js`
  - chess and tic-tac-toe routes, status endpoints, board profile switching
- `backend/src/routes/draw.js`
  - whiteboard preview, execute, stop, safety checks, ETA model, profile switching
- `backend/src/routes/control.js`
  - dry-run parsing and lock enforcement

### Calibration and Robot Interfaces
- `backend/src/robot/squares.js`
  - chess/tic-tac-toe board calibration from anchors `A1`, `B1`, `A2`
- `backend/src/robot/whiteboard.js`
  - whiteboard plane calibration from `topLeft`, `topRight`, `bottomLeft`
- `backend/src/robot/urTcp.js`
  - URScript TCP transport
- `backend/src/robot/urRtde.js`
  - RTDE motion monitoring and moving/idle state inference
- `backend/src/robot/urDashboard.js`
  - dashboard fallback status
- `backend/src/robot/state.js`
  - shared moving state and lock ownership

### Drawing Pipeline
- `backend/src/draw/vectorizeImage.js`
  - Node bridge that validates image payloads and launches Python
- `backend/src/draw/vectorize_opencv.py`
  - OpenCV contour extraction from raster images
- `backend/src/draw/planner.js`
  - stroke normalization, fitting, and simplification

## Component Interaction Summary
| Component | Responsibility | Inputs | Outputs |
|---|---|---|---|
| Frontend UI | collect user input and display state | clicks, uploads, tuning values | REST requests, visual feedback |
| `move.js` | chess and tic-tac-toe command handling | square/cell targets, dry-run state | URScript plans, status responses |
| `draw.js` | draw preview and execution | image input, tuning values | preview plans, safety checks, URScript |
| `squares.js` | board calibration | `A1`, `B1`, `A2`, target square | calibrated board pose |
| `whiteboard.js` | whiteboard calibration | `topLeft`, `topRight`, `bottomLeft`, normalized points | calibrated draw poses |
| `vectorize_opencv.py` | contour extraction | raster image and vectorization settings | contour strokes |
| `planner.js` | stroke cleanup | raw contour strokes | normalized simplified strokes |
| `urTcp.js` | robot command transport | generated URScript | commands sent to URSim |
| `urRtde.js` | live telemetry | RTDE packets | moving/idle status |
| `urDashboard.js` | fallback controller state | dashboard queries | connection / run state |

## Core Logic
### Board Mapping
The chess and tic-tac-toe workspaces use three manually defined anchor points. `A1` is treated as the origin. `B1` defines the file direction, and `A2` defines the rank direction. The code in `backend/src/robot/squares.js` builds basis vectors from those anchors and scales them by square size.

Pseudo-code:
```text
origin = A1
fileVec = B1 - A1
rankVec = A2 - A1
targetPose = origin + fileIndex * fileVec + rankIndex * rankVec
```

### Whiteboard Drawing Pipeline
The whiteboard path is a staged pipeline rather than a direct move command.

Pseudo-code:
```text
receive PNG/JPG + tuning values
-> extract contours with OpenCV
-> convert contours to normalized strokes
-> fit and simplify strokes
-> check safety limits
-> generate URScript
-> execute in URSim or robot controller
```

### URScript Generation
Movement routes generate URScript directly from calibrated poses. Drawing routes generate a joint-space approach move, linear pen-down strokes, and a pen-up departure move for each stroke.

Pseudo-code:
```text
for each stroke:
  move above first point
  lower pen to draw height
  trace stroke with linear moves
  lift pen before next stroke
```

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
To see real robot or URSim motion, make sure `Dry Run` is `OFF`.
When `Dry Run` is `ON`, the backend still generates scripts, but the robot does not move.

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

## Validation Snapshot
### Simulator Validation Status
| Workflow | Environment | Status | Notes |
|---|---|---|---|
| Chess move-to-square | URSim | validated | calibrated square selection and movement path tested in simulator |
| Chess pick/place flow | URSim | validated in simulator | software/UI flow implemented; no physical suction validation |
| Tic-tac-toe move and mark | URSim | validated | robot-side X/O marking supported |
| Whiteboard preview | URSim | validated | contour extraction and planning path verified |
| Whiteboard execute | URSim | validated | execution tested through generated URScript |
| RTDE moving/idle feedback | URSim | validated | used to improve UI status accuracy |

### Measured Whiteboard Planner Outputs
The table below was recorded from the preview results shown in the UI using the default `wall_default` whiteboard profile. `sample1.jpg` and `sample2.png` used the unmodified `balanced` preset. `sample3.png` required light tuning from that preset to obtain a usable preview. ETA values are listed in total seconds even though the UI displays them in `mm:ss` format.

The planner results are measured in five terms. Planned strokes means the number of continuous pen-down stroke segments after vectorization and simplification. Planned points means the number of point coordinates kept in the final stroke plan. Script lines means the number of URScript motion commands generated for execution, not lines of document text; in this implementation it is approximately `planned points + 2 x planned strokes` because each stroke adds an approach move and a lift move. Path length is the estimated physical pen-travel distance in meters on the calibrated whiteboard. ETA is the planner's estimated execution time in seconds.

| Sample Image | Planned Strokes | Planned Points | Script Lines | Path Length (m) | ETA (s) |
|---|---:|---:|---:|---:|---:|
| `sample1.jpg` | 10 | 146 | 166 | 2.03 | 76 |
| `sample2.png` | 19 | 232 | 270 | 4.93 | 176 |
| `sample3.png` | 4 | 173 | 181 | 4.44 | 156 |

For `sample3.png`, the tuning values set in the UI were `approxEpsilonFrac=0`, `simplifyEpsilon=0`, and `blurKsize=10`, with `all_binary` contour mode.

These metrics are useful for comparing preview complexity and expected draw duration, but they are still simulator-side results rather than physical robot measurements.

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

## Known Limitations
- Preview first, then execute, especially for high-detail images.
- Best results come from high-contrast images with simple backgrounds.
- The project is validated primarily in URSim, not on the physical robot.
- Physical suction behavior and pen contact were not fully validated on hardware.
- SVG/text direct draw input is currently disabled; raster image input is the supported path.
- Calibration quality directly affects physical drawing and pick accuracy.
- ETA is an estimate based on planned path length and configured speeds. It does not yet exactly match real robot execution time.
