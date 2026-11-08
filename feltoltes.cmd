@echo off
rem Dupla kattintással indítható: feltölti a változásokat a GitHubra.
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0feltoltes.ps1" %*
pause
