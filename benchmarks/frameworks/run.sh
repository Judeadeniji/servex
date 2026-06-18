#!/bin/bash

echo "Starting ServeX benchmark..."
bun --bun run servex.ts &
PID_SERVEX=$!
sleep 2
oha -c 100 -z 5s http://localhost:3001/
kill $PID_SERVEX
sleep 1

echo ""
echo "Starting Hono benchmark..."
bun --bun run hono.ts &
PID_HONO=$!
sleep 2
oha -c 100 -z 5s http://localhost:3002/
kill $PID_HONO
sleep 1

echo ""
echo "Starting Elysia benchmark..."
bun --bun run elysia.ts &
PID_ELYSIA=$!
sleep 2
oha -c 100 -z 5s http://localhost:3003/
kill $PID_ELYSIA
sleep 1

echo "Done"
