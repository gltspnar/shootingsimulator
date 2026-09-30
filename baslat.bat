@echo off
title Taktik Atis Simulatoru
echo ========================================================
echo       PRO TAKTIK ATIS VE EGITIM SIMULATORU
echo ========================================================

echo [1/3] Onceki calisan oturumlar temizleniyor...
taskkill /F /IM python.exe 2>nul
timeout /t 1 /nobreak >nul

echo [2/3] Calisma dizini ve Python ortami hazirlaniyor...
cd /d "%~dp0"

set "PY_EXE="
if exist "C:\Users\LENOVO\Downloads\nisan_env\Scripts\python.exe" (
    set "PY_EXE=C:\Users\LENOVO\Downloads\nisan_env\Scripts\python.exe"
) else if exist "%~dp0venv\Scripts\python.exe" (
    set "PY_EXE=%~dp0venv\Scripts\python.exe"
) else (
    set "PY_EXE=python"
)

echo Python calistirici: %PY_EXE%

echo [3/3] Tarayici 127.0.0.1:5000 adresine yonlendiriliyor ve Simulator baslatiliyor...
start "" cmd /c "timeout /t 2 /nobreak >nul & start http://127.0.0.1:5000"

"%PY_EXE%" app.py
if errorlevel 1 (
    echo.
    echo [HATA] Simulator sonlandi! Lutfen hata mesajini kontrol edin.
    pause
)
