import os
import hashlib
import subprocess

msi_path = r'C:\Users\anusr\AppData\Local\Temp\WinGet\Memurai.MemuraiDeveloper.4.1.2\Memurai-Developer-v4.1.2.msi'
print('Exists:', os.path.exists(msi_path))
if os.path.exists(msi_path):
    size = os.path.getsize(msi_path)
    print('Size:', size)
    h = hashlib.sha256()
    with open(msi_path, 'rb') as f:
        while chunk := f.read(65536):
            h.update(chunk)
    sha256 = h.hexdigest().upper()
    print('SHA256:', sha256)

    ps_code = """
    $p = '""" + msi_path + """'
    $s = Get-AuthenticodeSignature -FilePath $p
    [PSCustomObject]@{
        Status = $s.Status.ToString()
        StatusMessage = $s.StatusMessage
        Signer = $s.SignerCertificate.Subject
        Issuer = $s.SignerCertificate.Issuer
        ValidTo = $s.SignerCertificate.NotAfter
    } | ConvertTo-Json
    """
    res = subprocess.run(['powershell', '-Command', ps_code], capture_output=True, text=True)
    print('Signature info:\n' + res.stdout)

