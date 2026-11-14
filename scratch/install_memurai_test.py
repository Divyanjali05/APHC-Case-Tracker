import subprocess
import sys

msi = r'C:\Users\anusr\AppData\Local\Temp\WinGet\Memurai.MemuraiDeveloper.4.1.2\Memurai-Developer-v4.1.2.msi'
log = r'C:\Users\anusr\AppData\Local\Temp\memurai_silent_test.log'

print(f'Attempting silent install of {msi}...')
cmd = ['msiexec.exe', '/i', msi, '/qn', '/norestart', f'/l*v', log]
res = subprocess.run(cmd)
print('msiexec ExitCode:', res.returncode)

