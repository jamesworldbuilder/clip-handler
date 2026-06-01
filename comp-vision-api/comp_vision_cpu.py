import os
import cv2
import numpy as np
import base64
import uuid
import time
import json
import threading
import sys
from flask import Flask, request, jsonify, Response
from flask_cors import CORS
from ultralytics import YOLO

app = Flask(__name__)
CORS(app)

is_processing = False
waiting_for_payload = False

# loads yolov8 nano onnx model into memory
model = YOLO('yolov8n.onnx')

def decode_base64_image(b64_string):
    if "," in b64_string:
        b64_string = b64_string.split(",")[1]
    img_data = base64.b64decode(b64_string)
    nparr = np.frombuffer(img_data, np.uint8)
    return cv2.imdecode(nparr, cv2.IMREAD_COLOR)

# calculates intersection over union between two bounding boxes
def get_iou(boxA, boxB):
    xA = max(boxA[0], boxB[0])
    yA = max(boxA[1], boxB[1])
    xB = min(boxA[0] + boxA[2], boxB[0] + boxB[2])
    yB = min(boxA[1] + boxA[3], boxB[1] + boxB[3])
    
    interArea = max(0, xB - xA) * max(0, yB - yA)
    boxAArea = boxA[2] * boxA[3]
    boxBArea = boxB[2] * boxB[3]
    
    iou = interArea / float(boxAArea + boxBArea - interArea) if (boxAArea + boxBArea - interArea) > 0 else 0
    return iou

@app.route('/init_target', methods=['POST'])
def init_target():
    # validates cropped target image and generates identifiers
    try:
        data = request.json
        image_b64 = data.get('image')

        if not image_b64:
            return jsonify({"error": "No image provided"}), 400

        frame = decode_base64_image(image_b64)
        target_id = f"trk_{uuid.uuid4().hex[:8]}"

        identifiers = {
            "id": target_id,
            "algorithm": "YOLO/ONNX",
            "status": "Initialized",
            "dimensions": f"{frame.shape[1]}x{frame.shape[0]}"
        }

        print(f"[INIT] Target initialized: {target_id} ({frame.shape[1]}x{frame.shape[0]})", flush=True)
        return jsonify({"status": "success", "identifiers": identifiers})

    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route('/notify_extraction', methods=['POST'])
def notify_extraction():
    global waiting_for_payload
    if not waiting_for_payload:
        waiting_for_payload = True
        print("[IDLE] Awaiting UI frame extraction...", flush=True)
    return jsonify({"status": "acknowledged"})

@app.route('/track_frames', methods=['POST'])
def track_frames():
    global is_processing, waiting_for_payload

    if waiting_for_payload:
        waiting_for_payload = False    

    start_time = time.time()
    
    if is_processing:
        print("[WARN] Tracking request rejected: Server busy", flush=True)
        return jsonify({"error": "Server busy"}), 429
        
    is_processing = True
    try:
        data = request.json
        init_box = data.get('box')
        frames_b64 = data.get('frames', [])
        
        num_frames = len(frames_b64)
        print(f"[START] Processing tracking request for {num_frames} frames", flush=True)
        
        if not init_box or not frames_b64:
            return jsonify({"error": "Missing tracking box or frames"}), 400
            
        tracking_results = []
        target_id = None
        user_box = [int(init_box['x']), int(init_box['y']), int(init_box['w']), int(init_box['h'])]
        
        crash_info = {"crashed": False, "crash_index": -1, "error": ""}
        
        # custom generator safely yields frames and catches decoding errors mid-stream
        def safe_frame_generator():
            for idx, f in enumerate(frames_b64):
                try:
                    yield decode_base64_image(f)
                except Exception as e:
                    crash_info["crashed"] = True
                    crash_info["crash_index"] = idx
                    crash_info["error"] = str(e)
                    print(f"\n[ERROR] Frame {idx} corrupted. Halting stream.", flush=True)
                    break

        # iterates through safe frame stream and executes yolo tracking frame-by-frame
        for i, frame in enumerate(safe_frame_generator()):
            current_frame = i + 1
            elapsed_time = time.time() - start_time
            eta = (elapsed_time / current_frame) * (num_frames - current_frame)
            
            # prints standard log every 5 frames and on the final frame
            if current_frame % 5 == 0 or current_frame == num_frames:
                print(f"[PROCESSING] Tracking frame {current_frame}/{num_frames} | ETA: {eta:.1f}s", flush=True)

            # processes single frame with persist flag to maintain tracker memory across calls
            results = model.track(frame, persist=True, verbose=False)
            res = results[0]

            found_in_frame = False

            if res.boxes is not None and res.boxes.id is not None:
                xywh_boxes = res.boxes.xywh.cpu().numpy()
                xyxy_boxes = res.boxes.xyxy.cpu().numpy()
                ids = res.boxes.id.int().cpu().tolist()

                if i == 0:
                    best_iou = 0
                    best_id = None
                    
                    # calculates highest iou to identify target object id in initial frame
                    for idx, box in enumerate(xyxy_boxes):
                        x1, y1, x2, y2 = box
                        yolo_box = [x1, y1, x2 - x1, y2 - y1]
                        iou = get_iou(user_box, yolo_box)
                        
                        if iou > best_iou:
                            best_iou = iou
                            best_id = ids[idx]
                            
                    # checks if optimal iou exceeds threshold
                    if best_id is not None and best_iou > 0.1:
                        target_id = best_id
                        found_in_frame = True
                        print(f"[SUCCESS] YOLO identified target id {target_id} (IoU: {best_iou:.2f})", flush=True)
                        
                        idx = ids.index(target_id)
                        x1, y1, x2, y2 = [int(v) for v in xyxy_boxes[idx]]
                        w, h = x2 - x1, y2 - y1
                        tracking_results.append({
                            "frame_index": i, "x": x1, "y": y1, "w": w, "h": h,
                            "cx": x1 + (w/2), "cy": y1 + (h/2)
                        })
                else:
                    # searches for target id in subsequent frames
                    if target_id in ids:
                        idx = ids.index(target_id)
                        x1, y1, x2, y2 = [int(v) for v in xyxy_boxes[idx]]
                        w, h = x2 - x1, y2 - y1
                        tracking_results.append({
                            "frame_index": i, "x": x1, "y": y1, "w": w, "h": h,
                            "cx": x1 + (w/2), "cy": y1 + (h/2)
                        })
                        found_in_frame = True
            
            if not found_in_frame:
                tracking_results.append({"frame_index": i, "lost": True})

        elapsed = time.time() - start_time
        
        # gracefully returns partial tracking data if the stream crashed
        if crash_info["crashed"]:
            print(f"[PARTIAL] Processed {crash_info['crash_index']} frames before crashing in {elapsed:.2f}s", flush=True)
            return jsonify({
                "status": "partial_success", 
                "data": tracking_results,
                "stopped_at": crash_info["crash_index"],
                "error": crash_info["error"]
            })
            
        print(f"[COMPLETE] Processed {num_frames} frames in {elapsed:.2f}s", flush=True)
        return jsonify({"status": "success", "data": tracking_results})
        
    except Exception as e:
        print(f"[ERROR] Fatal exception in track_frames: {str(e)}", flush=True)
        return jsonify({"error": str(e)}), 500
    finally:
        is_processing = False

@app.route('/track_anchor', methods=['POST'])
def track_anchor():
    global is_processing, waiting_for_payload
    
    if waiting_for_payload:
        waiting_for_payload = False
        
    if is_processing:
        return jsonify({"error": "Server busy"}), 429
        
    is_processing = True
    try:
        data = request.json
        frames_b64 = data.get('frames', [])
        start_x = float(data.get('start_x'))
        start_y = float(data.get('start_y'))
        sample_radius = float(data.get('sample_radius', 20))
        
        num_frames = len(frames_b64)
        if not frames_b64 or num_frames == 0:
            return jsonify({"error": "Missing frames"}), 400
            
        # defines search parameters with expanded window and stricter convergence
        lk_params = dict(winSize=(31, 31), maxLevel=3, criteria=(cv2.TERM_CRITERIA_EPS | cv2.TERM_CRITERIA_COUNT, 20, 0.01))
        flow_results = []
        
        first_frame = decode_base64_image(frames_b64[0])
        prev_gray = cv2.cvtColor(first_frame, cv2.COLOR_BGR2GRAY)
        
        # generates a circular sample group matching the ui reticle circumference for robust texture tracking
        points = [[start_x, start_y]]
        
        # distributes 16 points evenly around the radius circumference
        for angle in np.linspace(0, 2 * np.pi, 16, endpoint=False):
            points.append([start_x + sample_radius * np.cos(angle), start_y + sample_radius * np.sin(angle)])
            
        p0 = np.array(points, dtype=np.float32).reshape(-1, 1, 2)
        
        # tracks execution start time for eta calculations
        start_time = time.time()
        spinner = ['|', '/', '-', '\\']
        
        # appends initial coordinates outside loop to prevent redundant condition checks
        flow_results.append({"frame_index": 0, "x": start_x, "y": start_y})
        
        crash_info = {"crashed": False, "crash_index": -1, "error": ""}
        
        for i in range(1, num_frames):
            current_frame = i + 1
            elapsed_time = time.time() - start_time
            eta = (elapsed_time / current_frame) * (num_frames - current_frame)
            
            # outputs carriage return to overwrite current console line with updated progress metrics
            print(f"\r[PROCESSING] {spinner[i % 4]} Frame {current_frame}/{num_frames} | ETA: {eta:.1f}s", end="", flush=True)
                
            try:
                curr_frame = decode_base64_image(frames_b64[i])
            except Exception as e:
                crash_info["crashed"] = True
                crash_info["crash_index"] = i
                crash_info["error"] = str(e)
                print(f"\n[ERROR] Frame {i} corrupted. Halting optical flow.", flush=True)
                break
                
            curr_gray = cv2.cvtColor(curr_frame, cv2.COLOR_BGR2GRAY)
            
            p1, st, err = cv2.calcOpticalFlowPyrLK(prev_gray, curr_gray, p0, None, **lk_params)
            
            # filters points that successfully tracked
            if p1 is not None:
                good_new = p1[st == 1]
                good_old = p0[st == 1]
            else:
                good_new = np.array([])
                good_old = np.array([])
            
            if len(good_new) > 0:
                # calculates median displacement of surviving points to prevent drift outliers
                dx = np.median(good_new[:, 0] - good_old[:, 0])
                dy = np.median(good_new[:, 1] - good_old[:, 1])
                
                last_x = flow_results[-1]["x"]
                last_y = flow_results[-1]["y"]
                
                new_x = last_x + dx
                new_y = last_y + dy
                
                flow_results.append({"frame_index": i, "x": float(new_x), "y": float(new_y)})
                
                # updates tracking cluster with exact pixel coordinates of surviving points
                p0 = good_new.reshape(-1, 1, 2)
                prev_gray = curr_gray
            else:
                last_x = flow_results[-1]["x"]
                last_y = flow_results[-1]["y"]
                flow_results.append({"frame_index": i, "x": last_x, "y": last_y})
                
        # preserves final progress line before next console output
        print()
        
        # gracefully returns partial optical flow data if the stream crashed
        if crash_info["crashed"]:
            return jsonify({
                "status": "partial_success", 
                "data": flow_results,
                "stopped_at": crash_info["crash_index"],
                "error": crash_info["error"]
            })
                
        return jsonify({"status": "success", "data": flow_results})
    except Exception as e:
        return jsonify({"error": str(e)}), 500
    finally:
        is_processing = False

@app.route('/', methods=['GET'])
def home():
    return jsonify({"status": "Ready"}), 200
