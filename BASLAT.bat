@echo off
title KuranaSor - Yerel Sunucu
cd /d "%~dp0"
echo.
echo  KuranaSor baslatiliyor...
echo  Tarayicida acilacak adres: http://localhost:4600
echo  Kapatmak icin bu pencereyi kapatin.
echo.
start "" http://localhost:4600
node server.js
pause
