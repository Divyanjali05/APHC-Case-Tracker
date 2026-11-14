import subprocess
import os

msi = r'C:\Users\anusr\AppData\Local\Temp\WinGet\Memurai.MemuraiDeveloper.4.1.2\Memurai-Developer-v4.1.2.msi'
target = r'C:\tools\memurai'
os.makedirs(target, exist_ok=True)
cmd = ['msiexec.exe', '/a', msi, '/qn', f'TARGETDIR={target}', '/l*v', r'C:\tools\memurai\extract.log']
res = subprocess.run(cmd)
print('Extract ExitCode:', res.returncode)

