@echo off
cd /d "%~dp0"
python sincronizar.py >> sincronizar.log 2>&1
