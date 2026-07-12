@echo off
title KuranaSor - Internet Paylasimi
cd /d "%~dp0"
echo.
echo  Once yerel sunucu baslatiliyor (ayri pencerede)...
start "KuranaSor Sunucu" cmd /c "node server.js"
timeout /t 3 >nul
echo.
echo  Paylasim linki olusturuluyor... Birazdan asagida
echo  https://....trycloudflare.com  seklinde bir adres cikacak.
echo  Bu adresi arkadaslarinizla paylasabilirsiniz.
echo.
echo  NOT: Link yalnizca bu pencere ACIK ve bilgisayariniz
echo  ACIK oldugu surece calisir. Kapatinca erisim durur.
echo.
npx -y untun@latest tunnel http://localhost:4600
pause
