@echo off
chcp 65001 >nul
cd /d "%~dp0"
where node >nul 2>nul || (echo 未检测到 Node.js，请先安装 https://nodejs.org （18 或更高版本） & pause & exit /b)
set OPEN_BROWSER=1
node server.js
pause
