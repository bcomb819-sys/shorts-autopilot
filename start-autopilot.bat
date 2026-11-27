@echo off
title Shorts Autopilot (24/7 Faceless YouTube Shorts)
cd /d "%~dp0"
echo Starting Shorts Autopilot on http://127.0.0.1:3456 ...
start "" "http://127.0.0.1:3456"
node src/server.js
pause
