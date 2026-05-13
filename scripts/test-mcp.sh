#!/bin/bash
# MCP HTTP 端到端测试
#
# 启动本地测试 MCP 服务器 → 运行 Agent 调用 MCP 工具 → 关闭服务器
#
# 使用：
#   bash scripts/test-mcp.sh

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
SERVER_PORT=9876

# 启动测试 MCP 服务器（后台）
echo "Starting MCP test server..."
npx tsx "$SCRIPT_DIR/mcp-test-server.ts" &
SERVER_PID=$!
trap "kill $SERVER_PID 2>/dev/null; exit" EXIT INT TERM

# 等待服务器就绪
for i in $(seq 1 10); do
  if curl -s http://localhost:$SERVER_PORT/mcp > /dev/null 2>&1; then
    break
  fi
  sleep 0.5
done

echo "Server ready. Running Agent with MCP tools..."

export MCP_SERVERS='[{"name":"test","url":"http://localhost:9876/mcp"}]'

echo "有哪些 MCP 工具可用？分别试一下" | npm run dev

echo ""
echo "Done!"
