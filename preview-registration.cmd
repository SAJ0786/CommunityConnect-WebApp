@echo off
setlocal
cd /d "%~dp0"
echo Starting the isolated registration prototype. No Firebase connection.
echo Open http://127.0.0.1:5196/ after the server prints its Local address.
node tools/preview-registration.mjs
if errorlevel 1 pause
