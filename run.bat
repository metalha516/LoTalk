@echo off
echo =====================================================
echo           LoTalk Virtual Environment Launcher
echo =====================================================
echo.

:: Enable UTF-8 mode for Python to prevent UnicodeEncodeError with emojis on Windows
set PYTHONUTF8=1
set PYTHONIOENCODING=utf-8

:: Check if Python is installed
python --version >nul 2>&1
if errorlevel 1 (
    echo [ERROR] Python is not installed or not in your system PATH.
    echo         Please install Python 3.8 or higher from https://www.python.org/
    echo         Make sure to check "Add Python to PATH" during installation.
    echo.
    pause
    exit /b 1
)

set "VENV_DIR=.venv"

:: Check if the virtual environment exists, if not, create it
if not exist "%VENV_DIR%" (
    echo [INFO] Creating a virtual environment in "%VENV_DIR%"...
    python -m venv "%VENV_DIR%"
    if errorlevel 1 (
        echo [ERROR] Failed to create virtual environment.
        pause
        exit /b 1
    )
    echo [SUCCESS] Virtual environment created successfully.
    
    echo [INFO] Upgrading pip inside the virtual environment...
    "%VENV_DIR%\Scripts\python.exe" -m pip install --upgrade pip -q
    if errorlevel 1 (
        echo [WARNING] Failed to upgrade pip. Proceeding anyway...
    )
    echo.
)

:: Run the quick start script using the virtual environment's python
echo [INFO] Launching LoTalk server...
echo.
"%VENV_DIR%\Scripts\python.exe" start.py

if errorlevel 1 (
    echo.
    echo [ERROR] The application closed with an error code.
    pause
    exit /b 1
)
