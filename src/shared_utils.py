#!/media/mint/workspace/python-bin/bin/python3
import subprocess
import os
import logging

# sets absolute paths relative to script location
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
ROOT_DIR = os.path.dirname(SCRIPT_DIR)
LOG_FILE = os.path.join(ROOT_DIR, "logs/producer.log")

logging.basicConfig(filename=LOG_FILE, level=logging.INFO, format='%(asctime)s - %(message)s')

def build_dynamic_zoom_logic(tracking_map, zoom_level=1.5):
    # builds a nested if-then-else string for ffmpeg
    # x_eq will look like: eq(n,0)*X0 + eq(n,1)*X1 + ...
    x_parts = []
    y_parts = []
    
    for i, coord in enumerate(tracking_map):
        # centers the zoom on the tracked coordinate
        # logic: (target_x - (screen_width / zoom / 2))
        target_x = coord['x'] - (640 / zoom_level / 2)
        target_y = coord['y'] - (360 / zoom_level / 2)
        
        # ensures coordinates don't go out of bounds
        target_x = max(0, min(target_x, 640))
        target_y = max(0, min(target_y, 360))
        
        x_parts.append(f"eq(n,{i})*{target_x}")
        y_parts.append(f"eq(n,{i})*{target_y}")
    
    # joins all frame instructions into one massive expression
    x_expr = "+".join(x_parts)
    y_expr = "+".join(y_parts)
    
    return f"zoompan=z='{zoom_level}':x='{x_expr}':y='{y_expr}':d=1:s=640x360"

def run_ffmpeg_pipeline(task):
    source_file = os.path.join(ROOT_DIR, task["source_file"].strip("/"))
    title = task["title"]
    filters = task["filters"]
    zoom_target = task.get("zoom_target")
    output_path = os.path.join(ROOT_DIR, "queue", f"{title}.mp4")

    vf_chain = []

    # 1. handles dynamic in-frame object tracking
    if zoom_target and zoom_target.get("tracking_map"):
        logging.info(f"building dynamic tracking logic for object: {zoom_target['name']}")
        zoom_logic = build_dynamic_zoom_logic(zoom_target["tracking_map"])
        vf_chain.append(zoom_logic)

    # 2. handles global creative edits
    if filters.get("bw"):
        vf_chain.append("hue=s=0")
        
    if filters.get("text"):
        txt = filters["text"]
        vf_chain.append(f"drawtext=text='{txt}':fontcolor=white:fontsize=48:x=(w-text_w)/2:y=(h-text_h)/2")

    video_filter = ",".join(vf_chain) if vf_chain else "null"

    ffmpeg_cmd = [
        "ffmpeg", "-y", "-i", source_file,
        "-vf", video_filter,
        "-c:v", "libx264", "-preset", "veryfast", "-crf", "22",
        output_path
    ]

    logging.info(f"executing production: {' '.join(ffmpeg_cmd)}")
    
    try:
        # captures output for the live terminal log
        process = subprocess.Popen(ffmpeg_cmd, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True)
        for line in process.stdout:
            if "frame=" in line:
                logging.info(line.strip())
        process.wait()
    except Exception as e:
        logging.error(f"production failed: {e}")
