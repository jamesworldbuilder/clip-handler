import os
import json
import time
import signal
import threading
from flask import Flask, request, jsonify, render_template, send_from_directory

# initializes flask app with explicit static folder routing
app = Flask(__name__, template_folder='../templates', static_folder='../static')

# toggles simulated latency for dev environment
TEST_MODE = True

# establishes absolute paths for file directories
ROOT_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
RAW_DIR = os.path.join(ROOT_DIR, "raw-clips")
QUEUE_FILE = os.path.join(ROOT_DIR, "config/task-queue.json")

# stores connection state and timestamp
last_heartbeat = time.time()
has_connected = False

@app.route("/")
def index():
    # serves main editor interface html
    return render_template("editor-ui.html")

@app.route("/raw-clips/<path:filename>")
def serve_video(filename):
    # serves requested mp4 file from raw directory
    return send_from_directory(RAW_DIR, filename)

@app.route("/heartbeat", methods=["POST"])
def heartbeat():
    # updates global timestamp and connection flag
    global last_heartbeat, has_connected
    has_connected = True
    last_heartbeat = time.time()
    return jsonify({"status": "ok"})

def monitor_heartbeat():
    # polls timestamp to ensure browser remains open after initial connection
    global last_heartbeat, has_connected
    while True:
        time.sleep(2)
        if has_connected and (time.time() - last_heartbeat > 5):
            os.kill(os.getpid(), signal.SIGTERM)

@app.route("/process-tracking", methods=["POST"])
def process_tracking():
    # extracts tracking parameters from frontend json payload
    data = request.json
    name = data.get("name", "Object")
    
    if TEST_MODE:
        time.sleep(4) 
        return jsonify({
            "status": "success",
            "tracking_map": [{"x": 100 + i, "y": 100 + (i//3)} for i in range(300)]
        })

    # returns error if cloud credentials are absent
    return jsonify({"status": "error", "message": "Cloud credentials required"})

@app.route("/submit-task", methods=["POST"])
def submit_task():
    # appends final assembly json payload to local queue file
    tasks = []
    if os.path.exists(QUEUE_FILE):
        with open(QUEUE_FILE, "r") as f:
            tasks = json.load(f)
    
    tasks.append(request.json)
    
    with open(QUEUE_FILE, "w") as f:
        json.dump(tasks, f, indent=2)
        
    return jsonify({"status": "success"})

if __name__ == "__main__":
    # spawns daemon thread to monitor browser connection
    threading.Thread(target=monitor_heartbeat, daemon=True).start()
    app.run(port=5000)
