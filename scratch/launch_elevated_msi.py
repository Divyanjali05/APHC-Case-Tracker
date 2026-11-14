import subprocess

msi = r'C:\Users\anusr\AppData\Local\Temp\WinGet\Memurai.MemuraiDeveloper.4.1.2\Memurai-Developer-v4.1.2.msi'
ps_script = f'''
Start-Process -FilePath "msiexec.exe" -ArgumentList "/i `"{msi}`"" -Verb RunAs
'''
res = subprocess.run(['powershell', '-Command', ps_script], capture_output=True, text=True)
print('STDOUT:', res.stdout)
print('STDERR:', res.stderr)
print('ExitCode:', res.returncode)

