#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CALLER_DIR="$PWD"
HOST="${COWART_HOST:-127.0.0.1}"
PORT="${COWART_PORT:-43217}"
PROJECT_DIR="${COWART_PROJECT_DIR:-${1:-$CALLER_DIR}}"
CANVAS_DIR="${COWART_CANVAS_DIR:-$PROJECT_DIR/canvas}"

export COWART_PROJECT_DIR="$PROJECT_DIR"
export COWART_CANVAS_DIR="$CANVAS_DIR"

cd "$ROOT_DIR"

# 查找当前仓库已经启动的 Cowart Vite 服务，避免同一画布重复开多个进程。
find_existing_cowart_pids() {
  pgrep -f "$ROOT_DIR/node_modules/.bin/vite" 2>/dev/null || true
}

# 打印已运行 Cowart 服务的真实监听地址，输出给调用方直接复用。
print_listening_addresses_for_pids() {
  for pid in "$@"; do
    lsof -nP -a -p "$pid" -iTCP -sTCP:LISTEN 2>/dev/null | awk 'NR > 1 { print $9 }'
  done
}

# 打印占用端口的进程信息，便于判断该停止哪个旧进程。
print_processes_for_pids() {
  local pid_list
  pid_list="$(IFS=,; echo "$*")"
  ps -p "$pid_list" -o pid=,command= 2>/dev/null || true
}

if [ ! -d node_modules ] || [ ! -x node_modules/.bin/vite ]; then
  npm install
fi

EXISTING_COWART_PIDS=()
while IFS= read -r pid; do
  if [ -n "$pid" ]; then
    EXISTING_COWART_PIDS+=("$pid")
  fi
done < <(find_existing_cowart_pids)
if [ "${#EXISTING_COWART_PIDS[@]}" -gt 0 ]; then
  echo "Cowart canvas is already running:"
  print_listening_addresses_for_pids "${EXISTING_COWART_PIDS[@]}" | sed 's#^#  http://#'
  echo "Cowart process:"
  print_processes_for_pids "${EXISTING_COWART_PIDS[@]}"
  exit 0
fi

# 端口被其他进程占用时直接失败；禁止 Vite 自动切到 43218/43219 造成 URL 混乱。
PORT_OWNER_PIDS=()
while IFS= read -r pid; do
  if [ -n "$pid" ]; then
    PORT_OWNER_PIDS+=("$pid")
  fi
done < <(lsof -nP -iTCP:"$PORT" -sTCP:LISTEN -t 2>/dev/null || true)
if [ "${#PORT_OWNER_PIDS[@]}" -gt 0 ]; then
  echo "Cowart canvas port ${HOST}:${PORT} is already in use." >&2
  echo "Refusing to start on a fallback port because that makes the canvas URL ambiguous." >&2
  echo "Port owner:" >&2
  print_processes_for_pids "${PORT_OWNER_PIDS[@]}" >&2
  exit 1
fi

echo "Cowart canvas: http://${HOST}:${PORT}"
echo "Cowart canvas data: ${CANVAS_DIR}/pages/<page-id>/cowart-canvas.json"
echo "Cowart page assets: ${CANVAS_DIR}/pages/<page-id>/assets -> http://${HOST}:${PORT}/page-assets/<page-id>/"
exec npm run dev -- --host "$HOST" --port "$PORT" --strictPort
