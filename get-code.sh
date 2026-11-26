#!/bin/bash

OUTPUT="civix-debug.txt"

{
  echo "========== PROJECT STRUCTURE =========="
  find backend frontend/src -type f \
    ! -path "*/node_modules/*" \
    ! -path "*/dist/*" 2>/dev/null

  echo ""
  echo "========== RELEVANT SOURCE CODE =========="

  find backend frontend/src -type f \
    \( -name "*.js" -o -name "*.jsx" -o -name "*.ts" -o -name "*.tsx" \) \
    ! -path "*/node_modules/*" \
    ! -path "*/dist/*" \
    ! -name "*.min.js" 2>/dev/null |
  grep -Ei 'server|socket|notification|petition|dashboard|navbar|auth|app|route|controller|middleware|utils' |
  while IFS= read -r file; do
    echo ""
    echo "========================================"
    echo "FILE: $file"
    echo "========================================"

    cat "$file"
  done

  echo ""
  echo "========== PACKAGE CONFIGURATION =========="

  for file in backend/package.json frontend/package.json; do
    if [ -f "$file" ]; then
      echo "FILE: $file"
      cat "$file"
    fi
  done

} > "$OUTPUT"

echo "Extraction complete: $OUTPUT"
wc -l "$OUTPUT"
