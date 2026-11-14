import os
import winreg
import subprocess

print('=== 1. CHECK C:\\Program Files\\PostgreSQL ===')
pg_dir = r'C:\Program Files\PostgreSQL'
if os.path.exists(pg_dir):
    print('Found:', os.listdir(pg_dir))
    for v in os.listdir(pg_dir):
        bin_dir = os.path.join(pg_dir, v, 'bin')
        if os.path.exists(bin_dir):
            psql = os.path.join(bin_dir, 'psql.exe')
            if os.path.exists(psql):
                try:
                    out = subprocess.check_output([psql, '--version'], text=True)
                    print(f'PostgreSQL {v} psql version:', out.strip())
                except Exception as e:
                    print(f'Error running psql in {v}: {e}')
else:
    print('Not found')

print('\n=== 2. CHECK REGISTRY FOR POSTGRESQL ===')
def check_reg(hive, subkey):
    try:
        with winreg.OpenKey(hive, subkey) as k:
            count = winreg.QueryInfoKey(k)[0]
            for i in range(count):
                try:
                    name = winreg.EnumKey(k, i)
                    if 'postgre' in name.lower():
                        with winreg.OpenKey(k, name) as ak:
                            try:
                                disp, _ = winreg.QueryValueEx(ak, 'DisplayName')
                                ver, _ = winreg.QueryValueEx(ak, 'DisplayVersion')
                                print(f'Registry entry: {disp} (Version: {ver})')
                            except Exception:
                                print(f'Registry key: {name}')
                except Exception:
                    pass
    except Exception:
        pass

check_reg(winreg.HKEY_LOCAL_MACHINE, r'SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall')
check_reg(winreg.HKEY_LOCAL_MACHINE, r'SOFTWARE\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall')
check_reg(winreg.HKEY_LOCAL_MACHINE, r'SOFTWARE\PostgreSQL')

print('\n=== 3. CHECK WINDOWS SERVICES FOR POSTGRESQL ===')
try:
    res = subprocess.run(['powershell', '-Command', 'Get-Service | Where-Object { $_.Name -like "*postgre*" } | Select-Object Name, DisplayName, Status | Format-Table -AutoSize'], capture_output=True, text=True)
    print(res.stdout)
except Exception as e:
    print('Service query error:', e)

print('\n=== 4. CHECK USER DOWNLOADS AND APPDATA FOR POSTGRES INSTALLERS ===')
search_dirs = [
    os.path.expandvars(r'%USERPROFILE%\Downloads'),
    os.path.expandvars(r'%LOCALAPPDATA%\Temp'),
    os.path.expandvars(r'%LOCALAPPDATA%\Temp\WinGet'),
]
for d in search_dirs:
    if os.path.exists(d):
        for root, dirs, files in os.walk(d):
            for f in files:
                if 'postgres' in f.lower():
                    fp = os.path.join(root, f)
                    print('Installer file found:', fp, f'({os.path.getsize(fp)} bytes)')

