#!/usr/bin/env python3
#OpenCV vectorizer. Reads a base64 image from stdin and returns normalized contour strokes.
import base64
import json
import math
import sys

import cv2
import numpy as np


#Return a structured JSON error so the Node side can surface it cleanly.
def fail(msg: str):
    print(json.dumps({"ok": False, "error": msg}))
    sys.exit(1)


#Clamp integer inputs from the payload into a safe range.
def clamp_int(v, lo, hi):
    try:
        n = int(v)
    except Exception:
        n = lo
    return max(lo, min(hi, n))


#Accept bool-like payload values from the JS side.
def parse_bool(v, default=False):
    if isinstance(v, bool):
        return v
    if isinstance(v, (int, float)):
        return v != 0
    if isinstance(v, str):
        s = v.strip().lower()
        if s in ("1", "true", "yes", "y", "on"):
            return True
        if s in ("0", "false", "no", "n", "off"):
            return False
    return default


#Read one JSON payload from stdin.
def parse_input():
    raw = sys.stdin.read()
    if not raw:
        fail("Empty input")
    try:
        return json.loads(raw)
    except Exception as exc:
        fail(f"Invalid JSON input: {exc}")


#Decode the uploaded base64 image into an OpenCV matrix.
def image_from_base64(data_b64: str):
    try:
        b = base64.b64decode(data_b64, validate=True)
    except Exception:
        fail("Invalid image base64")
    arr = np.frombuffer(b, dtype=np.uint8)
    img = cv2.imdecode(arr, cv2.IMREAD_COLOR)
    if img is None:
        fail("Could not decode image")
    return img


#Resize and smooth the image before contour extraction.
def preprocess(img, max_dim, blur_ksize):
    h, w = img.shape[:2]
    if max(h, w) > max_dim:
        scale = max_dim / float(max(h, w))
        nw = max(1, int(round(w * scale)))
        nh = max(1, int(round(h * scale)))
        img = cv2.resize(img, (nw, nh), interpolation=cv2.INTER_AREA)
    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    # Light blur reduces edge noise before contour extraction.
    if blur_ksize >= 3:
        if blur_ksize % 2 == 0:
            blur_ksize += 1
        gray = cv2.GaussianBlur(gray, (blur_ksize, blur_ksize), 0)
    return gray, img


#Build a mask that works for both dark strokes and bright colored logos.
def build_binary_outline_mask(gray, bgr):
    #Grayscale threshold catches dark strokes.
    _, mask = cv2.threshold(gray, 0, 255, cv2.THRESH_BINARY_INV + cv2.THRESH_OTSU)

    #Color-distance threshold catches bright colors on light backgrounds.
    lab = cv2.cvtColor(bgr, cv2.COLOR_BGR2LAB).astype(np.float32)
    h, w = lab.shape[:2]
    border = np.concatenate(
        [lab[0, :, :], lab[h - 1, :, :], lab[:, 0, :], lab[:, w - 1, :]], axis=0
    )
    bg = np.median(border, axis=0)
    dist = np.linalg.norm(lab - bg.reshape(1, 1, 3), axis=2)
    dist_u8 = np.clip(dist, 0, 255).astype(np.uint8)
    _, mask_color = cv2.threshold(dist_u8, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)
    mask = cv2.bitwise_or(mask, mask_color)

    #Light denoise only, avoid closing so inner holes are preserved.
    kernel = np.ones((2, 2), dtype=np.uint8)
    mask = cv2.morphologyEx(mask, cv2.MORPH_OPEN, kernel, iterations=1)
    return mask


#Convert one OpenCV contour into normalized [x, y] points.
def contour_to_points(cnt, w, h, approx_eps_frac):
    peri = cv2.arcLength(cnt, True)
    eps = max(0.5, approx_eps_frac * peri)
    approx = cv2.approxPolyDP(cnt, eps, True)
    pts = approx.reshape(-1, 2)
    if len(pts) < 2:
        return None

    out = []
    last = None
    for p in pts:
        x = float(p[0]) / float(w)
        y = float(p[1]) / float(h)
        x = min(1.0, max(0.0, x))
        y = min(1.0, max(0.0, y))
        cur = [x, y]
        if last is None or (abs(cur[0] - last[0]) > 1e-6 or abs(cur[1] - last[1]) > 1e-6):
            out.append(cur)
            last = cur

    if len(out) < 2:
        return None

    #Close the polyline so the robot draws a full loop for closed contours.
    dx = out[0][0] - out[-1][0]
    dy = out[0][1] - out[-1][1]
    if math.sqrt(dx * dx + dy * dy) > 1e-6:
        out.append(out[0])
    return out


#Oneshot CLI entry used by vectorizeImage.js.
def main():
    payload = parse_input()
    image_b64 = payload.get("imageBase64")
    if not image_b64:
        fail("imageBase64 is required")

    max_dim = clamp_int(payload.get("maxDim", 1024), 128, 2048)
    blur_ksize = clamp_int(payload.get("blurKsize", 5), 0, 31)
    canny_low = clamp_int(payload.get("cannyLow", 60), 1, 255)
    canny_high = clamp_int(payload.get("cannyHigh", 170), 1, 255)
    min_perimeter = float(payload.get("minPerimeterPx", 16.0))
    approx_eps_frac = float(payload.get("approxEpsilonFrac", 0.01))
    max_contours = clamp_int(payload.get("maxContours", 1200), 10, 5000)
    external_only = parse_bool(payload.get("externalOnly", True), True)
    outline_binary = parse_bool(payload.get("outlineBinary", True), True)

    img = image_from_base64(image_b64)
    gray, img_rs = preprocess(img, max_dim, blur_ksize)
    h, w = gray.shape[:2]

    if outline_binary:
        mask = build_binary_outline_mask(gray, img_rs)
        retrieval = cv2.RETR_EXTERNAL if external_only else cv2.RETR_CCOMP
        contours, _hier = cv2.findContours(mask, retrieval, cv2.CHAIN_APPROX_NONE)
        contour_mode = "external_binary" if external_only else "all_binary"
    else:
        edges = cv2.Canny(gray, canny_low, canny_high)
        edges = cv2.dilate(edges, np.ones((2, 2), dtype=np.uint8), iterations=1)
        retrieval = cv2.RETR_EXTERNAL if external_only else cv2.RETR_LIST
        contours, _hier = cv2.findContours(edges, retrieval, cv2.CHAIN_APPROX_NONE)
        contour_mode = "external_canny" if external_only else "all_canny"

    strokes = []
    for cnt in contours:
        if len(cnt) < 2:
            continue
        peri = cv2.arcLength(cnt, True)
        if peri < min_perimeter:
            continue
        points = contour_to_points(cnt, w, h, approx_eps_frac)
        if points is None:
            continue
        strokes.append((peri, points))

    #Largest contours first keeps the main logo/text outlines if we hit max_contours.
    strokes.sort(key=lambda it: it[0], reverse=True)
    strokes = strokes[:max_contours]
    out_strokes = [s[1] for s in strokes]
    out_points = sum(len(s) for s in out_strokes)

    print(
        json.dumps(
            {
                "ok": True,
                "width": int(w),
                "height": int(h),
                "strokeCount": len(out_strokes),
                "pointCount": int(out_points),
                "contourMode": contour_mode,
                "strokesNormalized": out_strokes,
            }
        )
    )


if __name__ == "__main__":
    try:
        main()
    except Exception as exc:
        fail(str(exc))
