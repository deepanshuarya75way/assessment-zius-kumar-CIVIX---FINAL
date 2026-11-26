#!/bin/bash

OUT="socket-actual-code.txt"

FILES=(
  "backend/server.js"
  "backend/package.json"
  "frontend/package.json"
  "frontend/src/socket.js"
  "frontend/src/services/api.js"
  "frontend/src/api.js"
  "frontend/src/components/Navbar.jsx"
  "frontend/src/App.jsx"
)

{
  for file in "${FILES[@]}"; do
    if [ -f "$file" ]; then
      echo ""
      echo "=========================================="
      echo "FILE: $file"
      echo "=========================================="
      cat "$file"
    fi
  done

  echo ""
  echo "=========================================="
  echo "BACKEND ROUTE FILES"
  echo "=========================================="

  find backend/routes -type f \
    \( -name "*.js" -o -name "*.ts" \) \
    2>/dev/null |
  while read -r file; do
    echo ""
    echo "FILE: $file"
    cat "$file"
  done

  echo ""
  echo "=========================================="
  echo "BACKEND MIDDLEWARE AND SOCKET REFERENCES"
  echo "=========================================="

  grep -RniE \
    'socket|notification:new|petition:updated|createAndEmitNotification|emitPetitionUpdate|join\(' \
    backend \
    --include="*.js" \
    --exclude-dir=node_modules \
    --exclude-dir=.git \
    2>/dev/null

} > "$OUT"

echo "Created $OUT"
