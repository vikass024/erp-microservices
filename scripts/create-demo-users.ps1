param(
    [string]$BaseUrl = 'http://localhost:8080',
    [string]$AdminPassword = 'DemoAdmin123!',
    [string]$FacultyPassword = 'DemoFaculty123!',
    [string]$StudentPassword = 'DemoStudent123!',
    [int]$HealthTimeoutSeconds = 180
)

$ErrorActionPreference = 'Stop'
$composePath = Join-Path (Split-Path $PSScriptRoot -Parent) 'docker-compose.yml'
$script:compose = Get-Content -LiteralPath $composePath -Raw
$script:BaseUrl = $BaseUrl.TrimEnd('/')

function Get-ComposeValue([string]$Service, [string]$Key) {
    $serviceMatch = [regex]::Match($script:compose, "(?ms)^  $([regex]::Escape($Service)):\s*\r?\n(?<body>.*?)(?=^  [A-Za-z0-9_-]+:|\z)")
    if (-not $serviceMatch.Success) { throw "Service '$Service' was not found in docker-compose.yml." }
    $line = [regex]::Match($serviceMatch.Groups['body'].Value, "(?m)^\s+$([regex]::Escape($Key)):\s*(?<value>[^\r\n#]+)")
    if (-not $line.Success) { throw "'$Key' was not found under '$Service' in docker-compose.yml." }
    $value = $line.Groups['value'].Value.Trim().Trim('"').Trim("'")
    if ($value -match '^\$\{([^}:]+)(?::-([^}]+))?\}$') {
        $variableName = $Matches[1]
        $fallbackValue = $Matches[2]
        $environmentValue = [Environment]::GetEnvironmentVariable($variableName)
        $envPath = Join-Path (Split-Path $PSScriptRoot -Parent) '.env'
        if (-not $environmentValue -and (Test-Path -LiteralPath $envPath)) {
            $envLine = [regex]::Match((Get-Content -LiteralPath $envPath -Raw), "(?m)^$([regex]::Escape($variableName))=(?<value>[^\r\n]*)")
            if ($envLine.Success) { $environmentValue = $envLine.Groups['value'].Value.Trim().Trim('"').Trim("'") }
        }
        if ($environmentValue) { return $environmentValue }
        if ($fallbackValue) { return $fallbackValue }
        throw "Compose value '$value' requires environment variable '$variableName'."
    }
    return $value
}

function Invoke-Api([string]$Method, [string]$Path, $Body = $null, [switch]$AllowConflict) {
    $params = @{ Uri = "$($script:BaseUrl)$Path"; Method = $Method; Headers = @{}; ErrorAction = 'Stop' }
    if ($null -ne $Body) {
        $params.ContentType = 'application/json'
        $params.Body = ConvertTo-Json -InputObject $Body -Depth 5 -Compress
    }
    try { return Invoke-RestMethod @params }
    catch {
        $status = 0
        if ($_.Exception.Response) { $status = [int]$_.Exception.Response.StatusCode }
        if ($AllowConflict -and $status -eq 409) { return $null }
        throw "API $Method $Path failed (HTTP $status): $($_.ErrorDetails.Message)"
    }
}

$deadline = (Get-Date).AddSeconds($HealthTimeoutSeconds)
do {
    try {
        $health = Invoke-RestMethod -Uri "$($script:BaseUrl)/health" -Method GET -TimeoutSec 5 -ErrorAction Stop
        if ($health.status -eq 'ok') { break }
    } catch { Start-Sleep -Seconds 2 }
    if ((Get-Date) -ge $deadline) { throw "Gateway health endpoint did not respond at $($script:BaseUrl)/health within $HealthTimeoutSeconds seconds." }
} while ($true)

$accounts = @(
    @{ name = 'Demo Administrator'; email = 'admin.demo@example.edu'; role = 'admin'; password = $AdminPassword },
    @{ name = 'Dr. Meera Nair'; email = 'meera.nair.demo@example.edu'; role = 'faculty'; password = $FacultyPassword },
    @{ name = 'Dr. Kiran Rao'; email = 'kiran.rao.demo@example.edu'; role = 'faculty'; password = $FacultyPassword },
    @{ name = 'Aarav Rao'; email = 'aarav.rao.demo@example.edu'; role = 'student'; password = $StudentPassword },
    @{ name = 'Ananya Iyer'; email = 'ananya.iyer.demo@example.edu'; role = 'student'; password = $StudentPassword },
    @{ name = 'Rohan Mehta'; email = 'rohan.mehta.demo@example.edu'; role = 'student'; password = $StudentPassword }
)

foreach ($account in $accounts) {
    Invoke-Api POST '/auth/register' @{ name = $account.name; email = $account.email; password = $account.password } -AllowConflict | Out-Null
    Write-Host "Registered or already exists: $($account.email)"
}

$dbUser = Get-ComposeValue 'auth-db' 'POSTGRES_USER'
$dbName = Get-ComposeValue 'auth-db' 'POSTGRES_DB'
foreach ($account in $accounts) {
    $escapedEmail = $account.email.Replace("'", "''")
    $sql = "UPDATE users SET role = '$($account.role)' WHERE email = '$escapedEmail';"
    $dockerArgs = @('compose', 'exec', '-T', 'auth-db', 'psql', '-U', $dbUser, '-d', $dbName, '-c', $sql)
    & docker @dockerArgs
    if ($LASTEXITCODE -ne 0) { throw "Could not set role '$($account.role)' for '$($account.email)' in the auth database." }
    Write-Host "Set role $($account.role): $($account.email)"
}

Write-Host 'Demo accounts are ready.'
