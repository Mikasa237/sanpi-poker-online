$ErrorActionPreference = "Stop"

$mutex = [System.Threading.Mutex]::new($false, "Local\SanpiPokerTunnel")
if (-not $mutex.WaitOne(0)) {
  exit 0
}

$repoRoot = Split-Path -Parent $PSScriptRoot
$stateDir = Join-Path $env:LOCALAPPDATA "SanpiPoker"
$logDir = Join-Path $stateDir "logs"
$secretFile = Join-Path $stateDir "session-secret.txt"
$hostIssueSecretFile = Join-Path $stateDir "host-issue-secret.txt"
$cloudflared = Join-Path $repoRoot "work\cloudflared\node_modules\@botharness\cloudflared-win32-x64\bin\cloudflared.exe"
$serverDir = Join-Path $repoRoot "outputs"
$runtimeFile = Join-Path $repoRoot "tunnel.json"
$ntfyTopic = "sanpi-1967e892780a467d91b8d4ae"

New-Item -ItemType Directory -Path $stateDir -Force | Out-Null
New-Item -ItemType Directory -Path $logDir -Force | Out-Null

function New-RandomSecret {
  $bytes = New-Object byte[] 48
  $generator = [System.Security.Cryptography.RandomNumberGenerator]::Create()
  try {
    $generator.GetBytes($bytes)
  } finally {
    $generator.Dispose()
  }
  return (-join ($bytes | ForEach-Object { $_.ToString("x2") }))
}

if (-not (Test-Path $secretFile)) {
  Set-Content -LiteralPath $secretFile -Value (New-RandomSecret) -NoNewline
}
if (-not (Test-Path $hostIssueSecretFile)) {
  Set-Content -LiteralPath $hostIssueSecretFile -Value (New-RandomSecret) -NoNewline
}

$env:SESSION_SECRET = (Get-Content -Raw $secretFile).Trim()
$env:HOST_ISSUE_SECRET = (Get-Content -Raw $hostIssueSecretFile).Trim()
$env:GIT_SSH_COMMAND = "ssh -o BatchMode=yes -o StrictHostKeyChecking=accept-new"

function Test-LocalServer {
  try {
    $response = Invoke-WebRequest -UseBasicParsing `
      -Uri "http://127.0.0.1:3000/api/health" -TimeoutSec 2
    return $response.StatusCode -eq 200
  } catch {
    return $false
  }
}

function Start-LocalServer {
  if (Test-LocalServer) {
    return
  }
  $stdout = Join-Path $logDir "server.out.log"
  $stderr = Join-Path $logDir "server.err.log"
  $server = Start-Process -FilePath "node.exe" `
    -ArgumentList "server.js" `
    -WorkingDirectory $serverDir `
    -WindowStyle Hidden `
    -PassThru `
    -RedirectStandardOutput $stdout `
    -RedirectStandardError $stderr
  for ($attempt = 0; $attempt -lt 40; $attempt += 1) {
    Start-Sleep -Milliseconds 250
    if (Test-LocalServer) {
      return $server
    }
  }
  throw "本地牌桌服务未能在 10 秒内启动。"
}

function Publish-TunnelUrl([string]$url) {
  if ($script:lastNtfyUrl -ne $url) {
    try {
      Invoke-WebRequest -UseBasicParsing `
        -Method Post `
        -Uri "https://ntfy.sh/$ntfyTopic" `
        -Body $url `
        -TimeoutSec 12 | Out-Null
      $script:lastNtfyUrl = $url
    } catch {
      Add-Content -LiteralPath (Join-Path $logDir "publish.err.log") `
        -Value "$(Get-Date -Format o) ntfy: $($_.Exception.Message)"
    }
  }

  if ($script:publishedUrl -eq $url) {
    return
  }

  $payload = [ordered]@{
    url = $url
    updatedAt = (Get-Date).ToUniversalTime().ToString("o")
  } | ConvertTo-Json
  [System.IO.File]::WriteAllText(
    $runtimeFile,
    $payload,
    (New-Object System.Text.UTF8Encoding($false))
  )

  Push-Location $repoRoot
  try {
    git add -- tunnel.json
    git diff --cached --quiet
    if ($LASTEXITCODE -ne 0) {
      git commit -m "Update Sanpi Poker tunnel endpoint"
      if ($LASTEXITCODE -ne 0) {
        throw "无法提交隧道地址。"
      }
    }
    git push origin main
    if ($LASTEXITCODE -ne 0) {
      throw "无法推送隧道地址。"
    }
    $script:publishedUrl = $url
  } finally {
    Pop-Location
  }
}

function Test-PublicTunnel([string]$url) {
  if (-not $url) {
    return $false
  }
  try {
    $response = Invoke-WebRequest -UseBasicParsing `
      -Uri "$url/api/health" -TimeoutSec 6
    return $response.StatusCode -eq 200
  } catch {
    return $false
  }
}

function Start-Tunnel {
  if (-not (Test-Path $cloudflared)) {
    throw "找不到 cloudflared.exe。"
  }
  $stdout = Join-Path $logDir "tunnel.out.log"
  $stderr = Join-Path $logDir "tunnel.err.log"
  $process = Start-Process -FilePath $cloudflared `
    -ArgumentList @("tunnel", "--url", "http://127.0.0.1:3000", "--no-autoupdate", "--protocol", "http2") `
    -WindowStyle Hidden `
    -PassThru `
    -RedirectStandardOutput $stdout `
    -RedirectStandardError $stderr

  for ($attempt = 0; $attempt -lt 120; $attempt += 1) {
    Start-Sleep -Milliseconds 250
    $log = if (Test-Path $stderr) {
      Get-Content -Raw $stderr
    } else {
      ""
    }
    $match = [regex]::Match($log, "https://[a-z0-9-]+\.trycloudflare\.com")
    if ($match.Success) {
      $script:tunnelUrl = $match.Value
      return $process
    }
    if ($process.HasExited) {
      throw "cloudflared 在生成公网地址前退出。"
    }
  }
  throw "cloudflared 未能在 30 秒内生成公网地址。"
}

try {
  while ($true) {
    try {
      Start-LocalServer | Out-Null
      $tunnel = Start-Tunnel
      $tunnelFailures = 0
      while (-not $tunnel.HasExited) {
        if (-not (Test-LocalServer)) {
          Start-LocalServer | Out-Null
        }
        try {
          Publish-TunnelUrl $script:tunnelUrl
        } catch {
          Add-Content -LiteralPath (Join-Path $logDir "publish.err.log") `
            -Value "$(Get-Date -Format o) $($_.Exception.Message)"
        }
        if (Test-PublicTunnel $script:tunnelUrl) {
          $tunnelFailures = 0
        } else {
          $tunnelFailures += 1
          Add-Content -LiteralPath (Join-Path $logDir "watchdog.err.log") `
            -Value "$(Get-Date -Format o) 公网隧道健康检查失败（$tunnelFailures/3）。"
          if ($tunnelFailures -ge 3) {
            Add-Content -LiteralPath (Join-Path $logDir "watchdog.err.log") `
              -Value "$(Get-Date -Format o) 连续三次失败，重建 Cloudflare 隧道。"
            if (-not $tunnel.HasExited) {
              Stop-Process -Id $tunnel.Id -Force
            }
            break
          }
        }
        Start-Sleep -Seconds 10
      }
    } catch {
      Add-Content -LiteralPath (Join-Path $logDir "watchdog.err.log") `
        -Value "$(Get-Date -Format o) $($_.Exception.Message)"
      Start-Sleep -Seconds 5
    }
  }
} finally {
  $mutex.ReleaseMutex()
  $mutex.Dispose()
}
