#!/media/mint/workspace/python-bin/bin/python3
import json
import os
import sys
import time
import importlib
# sets script directory path
SCRIPT_DIR=os.path.dirname(os.path.abspath(__file__))
sys.path.append(SCRIPT_DIR)
# dynamically imports module with dashed filename
shared_utils=importlib.import_module("shared_utils")
# sets core paths
ROOT_DIR=os.path.dirname(SCRIPT_DIR)
QUEUE_FILE=os.path.join(ROOT_DIR,"config","task-queue.json")
def process_next_task():
    # verifies queue file exists
    if not os.path.exists(QUEUE_FILE):return
    with open(QUEUE_FILE,"r") as f:
        tasks=json.load(f)
    if not tasks:return
    # isolates first task
    current_task=tasks[0]
    # executes dynamically generated ffmpeg string
    shared_utils.run_ffmpeg_pipeline(current_task)
    # removes completed task
    tasks.pop(0)
    with open(QUEUE_FILE,"w") as f:
        json.dump(tasks,f,indent=2)
def daemonize():
    # forks process
    if os.fork()>0:sys.exit(0)
    os.setsid()
    if os.fork()>0:sys.exit(0)
    # nullifies output streams
    with open('/dev/null','r') as f:os.dup2(f.fileno(),sys.stdin.fileno())
    with open('/dev/null','a+') as f:os.dup2(f.fileno(),sys.stdout.fileno())
    with open('/dev/null','a+') as f:os.dup2(f.fileno(),sys.stderr.fileno())
if __name__=="__main__":
    daemonize()
    while True:
        process_next_task()
        time.sleep(10)
