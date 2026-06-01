import os
import json
import cv2
import numpy as np
import base64
import re
from flask import Flask, request, jsonify
from flask_cors import CORS
from pyngrok import ngrok
from ultralytics import YOLO
from dotenv import load_dotenv

# Loads variables from local environment file
load_dotenv()

app = Flask(__name__)
CORS(app)

is_processing = False

# Retrieves and parses token database from environment variable
token_db_str = os.getenv("TOKEN_DB", "{}")
TOKEN_DB = json.loads(token_db_str)

# Initializes YOLO model for object identification
model = YOLO('yolov8n.pt')

def decode_base64_image(b64_string):
    if "," in b64_string:
        b64_string = b64_string.split(",")[1]
    img_data = base64.b64decode(b64_string)
    nparr = np.frombuffer(img_data, np.uint8)
    return cv2.imdecode(nparr, cv2.IMREAD_COLOR)

@app.route('/track_frames', methods=['POST'])
def track_frames():
    global is_processing
    auth_header = request.headers.get('Authorization')
    
    # Validates authorization header presence
    if not auth_header or not auth_header.startswith("Bearer "):
        return jsonify({"error": "Unauthorized"}), 401

    token = auth_header.split(" ")[1]
    
    # Validates token against standard password characters using regex
    if not re.match(r'^[A-Za-z0-9@#$%^&+=_-]+$', token):
        return jsonify({"error": "Invalid format"}), 400

    # Checks if token exists within the database keys
    if token not in TOKEN_DB:
        return jsonify({"error": "Incorrect password"}), 401

    user_data = TOKEN_DB[token]
    
    # Enforces usage quota limits
    if user_data["limit"] is not None and user_data["used"] >= user_data["limit"]:
        return jsonify({"error": "Quota exceeded"}), 403

    if is_processing:
        return jsonify({"error": "Server busy"}), 429

    is_processing = True

    try:
        user_data["used"] += 1
        data = request.json
        frames_b64 = data.get('frames', [])

        if not frames_b64:
            return jsonify({"error": "No frames received"}), 400

        tracking_results = []

        # Iterates through provided frames for processing
        for i, f_b64 in enumerate(frames_b64):
            frame = decode_base64_image(f_b64)
            
            # Executes YOLO tracking on the current frame
            results = model.track(frame, persist=True)
            
            # Extracts bounding box data if an object is detected
            if results[0].boxes.id is not None:
                boxes = results[0].boxes.xyxy.cpu().numpy()
                track_ids = results[0].boxes.id.int().cpu().tolist()
                
                x1, y1, x2, y2 = boxes[0]
                tracking_results.append({
                    "frame_index": i, 
                    "x": int(x1), 
                    "y": int(y1),
                    "w": int(x2 - x1), 
                    "h": int(y2 - y1),
                    "id": track_ids[0]
                })
            else:
                tracking_results.append({"frame_index": i, "lost": True})

        return jsonify({"status": "success", "data": tracking_results})

    except Exception as e:
        return jsonify({"error": str(e)}), 500
    finally:
        is_processing = False

@app.route('/', methods=['GET'])
def home():
    return "nGrok API is online and listening"

# Retrieves ngrok token from environment variable
NGROK_TOKEN = os.getenv("NGROK_AUTH_TOKEN")

# Sets ngrok authentication token
ngrok.set_auth_token(NGROK_TOKEN)
public_url = ngrok.connect(5000)
print(f"nGrok API running at: {public_url}")
app.run(port=5000)
