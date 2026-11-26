#!/bin/bash

OUTPUT="civix-socket-code.txt"

echo "Extracting CIVIX source code..."

{
  echo "========== PROJECT STRUCTURE =========="
  find backend frontend/src -type f \
    ! -path "*/node_modules/*" \
    ! -path "*/dist/*" \
    2>/dev/null

  echo ""
  echo "========== BACKEND AND FRONTEND CODE =========="

  find backend frontend/src -type f \
    \( -name "*.js" -o -name "*.jsx" -o -name "*.ts" -o -name "*.tsx" -o -name "package.json" \) \
    ! -path "*/node_modules/*" \
    ! -path "*/dist/*" \
    ! -name "*.min.js" \
    2>/dev/null |
  while IFS= read -r file; do

    echo ""
    echo "========================================"
    echo "FILE: $file"
    echo "========================================"

    cat "$file"

  done

  echo ""
  echo "========== DEPENDENCIES =========="

  for file in backend/package.json frontend/package.json; do
    if [ -f "$file" ]; then
      echo "FILE: $file"
      cat "$file"
    fi
  done

} > "$OUTPUT"

echo "========================================"
echo "EXTRACTION COMPLETE"
echo "Output: $OUTPUT"
echo "========================================"
echo "Lines extracted:"
wc -l "$OUTPUT"
