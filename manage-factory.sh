#!/bin/bash

# configuration paths
ROOT_DIR="/media/mint/workspace/yt-factory"
PYTHON_BIN="/media/mint/workspace/python-bin/bin/python3"
PRODUCER_PID_FILE="$ROOT_DIR/config/producer.pid"
CONSUMER_PID_FILE="$ROOT_DIR/config/consumer.pid"

# terminal colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
NC='\033[0m'

mkdir -p "$ROOT_DIR/logs" "$ROOT_DIR/config"

get_status() {
    echo -e "\n--- Factory Status ---"
    for NAME in "Consumer" "Producer"; do
        PID_FILE="$ROOT_DIR/config/$(echo $NAME | tr '[:upper:]' '[:lower:]').pid"
        if [ -f "$PID_FILE" ]; then
            VAL=$(cat "$PID_FILE")
            if ps -p "$VAL" > /dev/null; then
                echo -e "$NAME: ${GREEN}RUNNING${NC} (PID: $VAL)"
            else
                echo -e "$NAME: ${RED}CRASHED${NC} (Stale PID file detected)"
            fi
        else
            echo -e "$NAME: ${RED}STOPPED${NC}"
        fi
    done
    echo "----------------------"
}

start_factory() {
    # handles stale pid files by verifying process existence
    for FILE in "$CONSUMER_PID_FILE" "$PRODUCER_PID_FILE"; do
        if [ -f "$FILE" ]; then
            VAL=$(cat "$FILE")
            if ! ps -p "$VAL" > /dev/null; then 
                rm "$FILE" 
            else
                echo "Error: Factory components are already running."
                get_status && exit 1
            fi
        fi
    done

    echo "Starting factory services..."
    
    # starts rendering engine
    $PYTHON_BIN "$ROOT_DIR/src/consumer.py" >> "$ROOT_DIR/logs/consumer.log" 2>&1 &
    echo $! > "$CONSUMER_PID_FILE"
    
    # starts web server
    $PYTHON_BIN "$ROOT_DIR/src/editor_server.py" >> "$ROOT_DIR/logs/producer.log" 2>&1 &
    echo $! > "$PRODUCER_PID_FILE"
    
    sleep 2
    get_status
}

stop_factory() {
    echo "Shutting down factory..."
    for PID_FILE in "$CONSUMER_PID_FILE" "$PRODUCER_PID_FILE"; do
        if [ -f "$PID_FILE" ]; then
            # targets specific pids to avoid global kills [cite: 2026-03-03]
            TARGET_PID=$(cat "$PID_FILE")
            kill "$TARGET_PID" 2>/dev/null
            wait "$TARGET_PID" 2>/dev/null
            rm "$PID_FILE"
        fi
    done
    get_status
}

case "$1" in
    start) start_factory ;;
    stop) stop_factory ;;
    status) get_status ;;
    restart) stop_factory; sleep 1; start_factory ;;
    *) echo "Usage: $0 [ start|stop|status|restart ]"; 
       echo -e "Fetch Clip: [ ${YELLOW}$PYTHON_BIN src/fetch_clip.py --url \"https://www.youtube.com/watch?v=XfG69AEUS6E\" --start \"00:00:01\" --end \"00:00:13\" --title \"test-clip-2\" --watch${NC} ]"; 
       echo -e "Test Mode: [ ${YELLOW}$PYTHON_BIN src/fetch_clip.py --title \"test-clip-1\" --url \"test\" --start 0 --end 0 --watch${NC} ]"; exit 1 ;;
esac
