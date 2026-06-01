#!/media/mint/workspace/python-bin/bin/python3
import os
import sys
import subprocess
import webbrowser
import argparse
import time
import urllib.request
import signal

# toggles local file usage for development testing
TEST_MODE = True

# traps manual keyboard interrupts
def signal_handler(sig, frame):
    os._exit(0)
    
signal.signal(signal.SIGINT, signal_handler)

# configures file paths
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
ROOT_DIR = os.path.dirname(SCRIPT_DIR)
RAW_DIR = os.path.join(ROOT_DIR, "raw-clips")
CONFIG_DIR = os.path.join(ROOT_DIR, "config")
PRODUCER_LOG = os.path.join(ROOT_DIR, "logs/producer.log")
CONSUMER_LOG = os.path.join(ROOT_DIR, "logs/consumer.log")
QUEUE_FILE = os.path.join(ROOT_DIR, "config/task-queue.json")

USER_AGENT = "Mozilla/5.0 (X11; Linux x86_64; rv:148.0) Gecko/20100101 Firefox/148.0"
YTDLP_BIN = os.path.join(os.path.dirname(sys.executable), "yt-dlp")

os.makedirs(RAW_DIR, exist_ok=True)
os.makedirs(CONFIG_DIR, exist_ok=True)

# downloads clip and launches browser
def fetch_clip(url, start, end, title):
    raw_path = os.path.join(RAW_DIR, f"{title}.mp4")
    
    if not TEST_MODE:
        ytdlp_cmd = [
            YTDLP_BIN,
            "--no-update",
            "--download-sections", f"*{start}-{end}",
            "--force-keyframes-at-cuts",
            "--cookies-from-browser", "firefox",
            "--user-agent", USER_AGENT,
            "--js-runtimes", "node",
            "--extractor-args", "youtubepot-bgutilhttp:base_url=http://127.0.0.1:8080",
            "-f", "bestvideo[ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]/best",
            "-o", raw_path,
            url
        ]
        
        subprocess.run(ytdlp_cmd, check=True)
    else:
        # outputs console notice when test mode bypasses download
        print(f"Skipping download, using local file: {raw_path}")

    editor_url = f"http://127.0.0.1:5000/?file={title}.mp4&title={title}"
    webbrowser.open(editor_url)

if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--url", required=True)
    parser.add_argument("--start", required=True)
    parser.add_argument("--end", required=True)
    parser.add_argument("--title", required=True)
    parser.add_argument("--watch", action="store_true")
    args = parser.parse_args()
    
    if args.watch:
        open(PRODUCER_LOG, 'w').close()
        open(CONSUMER_LOG, 'w').close()
        
    fetch_clip(args.url, args.start, args.end, args.title)
    
    if args.watch:
        initial_mtime = os.path.getmtime(QUEUE_FILE) if os.path.exists(QUEUE_FILE) else 0
        tail_proc = None
        
        # polls server continuously and handles tail process
        while True:
            try:
                urllib.request.urlopen("http://127.0.0.1:5000/", timeout=1)
            except Exception:
                if tail_proc:
                    tail_proc.terminate()
                os._exit(0)
                
            current_mtime = os.path.getmtime(QUEUE_FILE) if os.path.exists(QUEUE_FILE) else 0
            if current_mtime != initial_mtime and tail_proc is None:
                tail_proc = subprocess.Popen(["tail", "-f", PRODUCER_LOG, CONSUMER_LOG])
            
            time.sleep(1)
