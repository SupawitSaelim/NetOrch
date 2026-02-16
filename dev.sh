#!/usr/bin/env bash
# ──────────────────────────────────────────────
# NetOrch Dev Server  –  start / stop / restart
# Usage:
#   ./dev.sh start   – launch backend & frontend
#   ./dev.sh stop    – kill both
#   ./dev.sh restart – stop then start
#   ./dev.sh status  – check if running
# ──────────────────────────────────────────────
set -euo pipefail
DIR="$(cd "$(dirname "$0")" && pwd)"
BACKEND_PORT=8000
FRONTEND_PORT=5173
LOG_DIR="$DIR/.logs"
mkdir -p "$LOG_DIR"

red()   { printf '\033[0;31m%s\033[0m\n' "$*"; }
green() { printf '\033[0;32m%s\033[0m\n' "$*"; }
cyan()  { printf '\033[0;36m%s\033[0m\n' "$*"; }

_pids_on_port() { lsof -ti :"$1" 2>/dev/null || true; }

do_stop() {
  cyan "Stopping NetOrch services..."
  local be_pids fe_pids
  be_pids=$(_pids_on_port $BACKEND_PORT)
  fe_pids=$(_pids_on_port $FRONTEND_PORT)

  if [[ -n "$be_pids" ]]; then
    echo "$be_pids" | xargs kill -9 2>/dev/null || true
    green "  Backend  (port $BACKEND_PORT) stopped"
  else
    echo "  Backend  – not running"
  fi

  if [[ -n "$fe_pids" ]]; then
    echo "$fe_pids" | xargs kill -9 2>/dev/null || true
    green "  Frontend (port $FRONTEND_PORT) stopped"
  else
    echo "  Frontend – not running"
  fi
}

do_start() {
  # ── Backend ──
  if [[ -n "$(_pids_on_port $BACKEND_PORT)" ]]; then
    echo "  Backend already running on :$BACKEND_PORT"
  else
    cyan "Starting Backend..."
    cd "$DIR/backend"
    .venv/bin/uvicorn app.main:app \
      --host 0.0.0.0 --port $BACKEND_PORT --reload \
      > "$LOG_DIR/backend.log" 2>&1 &
    sleep 1
    if [[ -n "$(_pids_on_port $BACKEND_PORT)" ]]; then
      green "  Backend  ➜  http://localhost:$BACKEND_PORT"
    else
      red "  Backend failed to start – see $LOG_DIR/backend.log"
    fi
  fi

  # ── Frontend ──
  if [[ -n "$(_pids_on_port $FRONTEND_PORT)" ]]; then
    echo "  Frontend already running on :$FRONTEND_PORT"
  else
    cyan "Starting Frontend..."
    cd "$DIR/frontend"
    export PATH="/opt/homebrew/opt/node@22/bin:$PATH"
    npm run dev > "$LOG_DIR/frontend.log" 2>&1 &
    sleep 2
    if [[ -n "$(_pids_on_port $FRONTEND_PORT)" ]]; then
      green "  Frontend ➜  http://localhost:$FRONTEND_PORT"
    else
      red "  Frontend failed to start – see $LOG_DIR/frontend.log"
    fi
  fi

  echo ""
  green "Logs: $LOG_DIR/"
}

do_status() {
  echo "Backend  (port $BACKEND_PORT): $( [[ -n "$(_pids_on_port $BACKEND_PORT)" ]] && green "RUNNING" || red "STOPPED" )"
  echo "Frontend (port $FRONTEND_PORT): $( [[ -n "$(_pids_on_port $FRONTEND_PORT)" ]] && green "RUNNING" || red "STOPPED" )"
}

case "${1:-start}" in
  start)   do_start ;;
  stop)    do_stop ;;
  restart) do_stop; sleep 1; do_start ;;
  status)  do_status ;;
  *)
    echo "Usage: $0 {start|stop|restart|status}"
    exit 1
    ;;
esac
