#!/bin/bash
echo "Запуск ИС Банк (http://localhost:3001)..."
cd "$(dirname "$0")/bank" && node server.js &
BANK_PID=$!

echo "Запуск ИС Библиотека (http://localhost:3002)..."
cd "$(dirname "$0")/library" && node server.js &
LIB_PID=$!

echo ""
echo "  ИС Банк:       http://localhost:3001"
echo "  ИС Библиотека: http://localhost:3002"
echo ""
echo "Ctrl+C для остановки"

wait $BANK_PID $LIB_PID
