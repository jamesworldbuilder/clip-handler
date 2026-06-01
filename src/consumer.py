#!/media/mint/workspace/python-bin/bin/python3
import os
import json
import time
import subprocess
import signal
import sys

# absolute paths relative to script location
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
ROOT_DIR = os.path.dirname(SCRIPT_DIR)
QUEUE_FILE = os.path.join(ROOT_DIR, "config/task-queue.json")
LOG_FILE = os.path.join(ROOT_DIR, "logs/consumer.log")
OUTPUT_DIR = os.path.join(ROOT_DIR, "final-renders")

# creates output directory if missing
os.makedirs(OUTPUT_DIR, exist_ok=True)

def signal_handler(sig, frame):
    # catches termination signals to prevent shell from reporting terminated status
    # 15 is SIGTERM, 2 is SIGINT (Ctrl+C)
    log_event(f"received signal {sig}, shutting down gracefully")
    sys.exit(0)

# registers signal listeners for graceful exit
signal.signal(signal.SIGINT, signal_handler)
signal.signal(signal.SIGTERM, signal_handler)

def log_event(message):
    # appends timestamped events to the log file
    timestamp = time.strftime("%Y-%m-%d %H:%M:%S")
    with open(LOG_FILE, "a") as f:
        f.write(f"[{timestamp}] {message}\n")

def process_task(task):
    input_file = task.get("file")
    title = task.get("title")
    output_path = os.path.join(OUTPUT_DIR, f"{title}-final.mp4")
    
    log_event(f"starting render for: {title}")
    
    # refers to https://ffmpeg.org/ for command flag definitions
    cmd = [
        "ffmpeg", "-y",
        "-i", os.path.join(ROOT_DIR, "raw-clips", input_file),
        "-c:v", "libx264", "-crf", "18", "-preset", "veryfast",
        "-c:a", "aac", "-b:a", "192k",
        output_path
    ]
    
    try:
        subprocess.run(cmd, check=True, capture_output=True)
        log_event(f"successfully rendered: {output_path}")
    except subprocess.CalledProcessError as e:
        log_event(f"render failed for {title}: {e.stderr.decode()}")

def main():
    log_event("consumer service started")
    
    while True:
        if os.path.exists(QUEUE_FILE) and os.path.getsize(QUEUE_FILE) > 0:
            try:
                with open(QUEUE_FILE, "r+") as f:
                    tasks = json.load(f)
                    f.seek(0)
                    f.truncate()
                
                for task in tasks:
                    process_task(task)
            except (json.JSONDecodeError, OSError):
                # ignores transient file access issues
                pass
        
        time.sleep(2)

if __name__ == "__main__":
    main()
