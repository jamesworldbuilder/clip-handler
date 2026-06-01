import json
import os
import argparse
import subprocess

# defines absolute paths relative to the script location
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
ROOT_DIR = os.path.dirname(SCRIPT_DIR)
QUEUE_FILE = os.path.join(ROOT_DIR, "config/task-queue.json")
PRODUCER_LOG = os.path.join(ROOT_DIR, "logs/producer.log")
CONSUMER_LOG = os.path.join(ROOT_DIR, "logs/consumer.log")

def add_to_queue(url, start, end, title):
    # initializes empty list if file does not exist
    if not os.path.exists(QUEUE_FILE):
        tasks = []
    else:
        # reads existing tasks from the json file
        with open(QUEUE_FILE, "r") as f:
            tasks = json.load(f)

    # appends the new task object to the list
    tasks.append({
        "url": url,
        "start": start,
        "end": end,
        "title": title
    })

    # writes the updated list back to the config file
    with open(QUEUE_FILE, "w") as f:
        json.dump(tasks, f, indent=2)

if __name__ == "__main__":
    # sets up command line arguments
    parser = argparse.ArgumentParser()
    parser.add_argument("--url", required=True)
    parser.add_argument("--start", required=True)
    parser.add_argument("--end", required=True)
    parser.add_argument("--title", required=True)
    parser.add_argument("--watch", action="store_true", help="Monitor the production logs live")
    args = parser.parse_args()
    
    add_to_queue(args.url, args.start, args.end, args.title)
    print(f"added {args.title} to the factory line")
    
    # triggers live log feed for both daemons if watch flag is present
    if args.watch:
        print("switching to live log feed - press Ctrl+C to exit")
        try:
            subprocess.run(["tail", "-f", PRODUCER_LOG, CONSUMER_LOG])
        except KeyboardInterrupt:
            pass
