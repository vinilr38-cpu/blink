@echo off
TITLE Blink Project Launcher
COLOR 0B

echo.
echo  #########################################
echo  #                                       #
echo  #      BLINK PROJECT LAUNCHER           #
echo  #                                       #
echo  #########################################
echo.

:: Check for Node.js
where node >nul 2>nul
if %ERRORLEVEL% neq 0 (
    echo [ERROR] Node.js not found. Please install Node.js first from https://nodejs.org/
    echo Press any key to exit...
    pause >nul
    exit
)

echo [INFO] Node.js version detected:
node -v

:: 1. Setup Frontend
if not exist "node_modules" (
    echo [1/3] Installing frontend dependencies...
    call npm install
) else (
    echo [1/3] Frontend dependencies already installed.
)

:: 2. Setup Backend
if not exist "server\node_modules" (
    echo [2/3] Installing backend dependencies...
    cd server
    call npm install
    cd ..
) else (
    echo [2/3] Backend dependencies already installed.
)

:: 3. Run Servers
echo [3/3] Launching project...

:: Launch backend in a separate window
echo Starting Backend Server on port 5001...
start "Blink Backend Server" cmd /k "cd server && node --watch server.js"

:: Give the backend a moment to start
timeout /t 2 /nobreak >nul

:: Launch browser
echo Opening http://localhost:3000 ...
start "" "http://localhost:3000"

:: Launch frontend in this window
echo Starting Frontend Development Server...
call npm run dev

pause
