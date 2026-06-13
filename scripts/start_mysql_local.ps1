$ErrorActionPreference = 'Stop'

$mysqlServer = 'C:\Program Files\MySQL\MySQL Server 8.4\bin\mysqld.exe'
$configFile = Join-Path $PSScriptRoot '..\database\mysql-local.ini'

if (Get-NetTCPConnection -LocalAddress '127.0.0.1' -LocalPort 3306 -State Listen -ErrorAction SilentlyContinue) {
    Write-Output 'Local MySQL is already listening on 127.0.0.1:3306.'
    exit 0
}

Start-Process -FilePath $mysqlServer `
    -ArgumentList "--defaults-file=`"$configFile`" --console" `
    -WindowStyle Hidden

for ($attempt = 0; $attempt -lt 30; $attempt += 1) {
    Start-Sleep -Milliseconds 500
    if (Get-NetTCPConnection -LocalAddress '127.0.0.1' -LocalPort 3306 -State Listen -ErrorAction SilentlyContinue) {
        Write-Output 'Local MySQL started on 127.0.0.1:3306.'
        exit 0
    }
}

throw 'Local MySQL did not start within 15 seconds.'
