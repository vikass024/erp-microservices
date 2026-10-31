param(
    [string]$BaseUrl = 'http://localhost:8080',
    [string]$Email = 'admin.demo@example.edu',
    [string]$Password = 'DemoAdmin123!',
    [string]$Name = 'Demo Administrator',
    [int]$HealthTimeoutSeconds = 180
)

$ErrorActionPreference = 'Stop'
$composePath = Join-Path (Split-Path $PSScriptRoot -Parent) 'docker-compose.yml'
$compose = Get-Content -LiteralPath $composePath -Raw

function Get-ComposeValue([string]$Service, [string]$Key) {
    $serviceMatch = [regex]::Match($script:compose, "(?ms)^  $([regex]::Escape($Service)):\s*\r?\n(?<body>.*?)(?=^  [A-Za-z0-9_-]+:|\z)")
    if (-not $serviceMatch.Success) { throw "Service '$Service' was not found in docker-compose.yml." }
    $line = [regex]::Match($serviceMatch.Groups['body'].Value, "(?m)^\s+$([regex]::Escape($Key)):\s*(?<value>[^\r\n#]+)")
    if (-not $line.Success) { throw "'$Key' was not found under '$Service' in docker-compose.yml." }
    $value = $line.Groups['value'].Value.Trim().Trim('"').Trim("'")
    if ($value -match '^\$\{[^:}]+:-([^}]+)\}$') { return $Matches[1] }
    if ($value -match '^\$\{([^}:]+)\}$') {
        $environmentValue = [Environment]::GetEnvironmentVariable($Matches[1])
        if ($environmentValue) { return $environmentValue }
        throw "Compose value '$value' requires environment variable '$($Matches[1])'."
    }
    return $value
}

function Invoke-Api([string]$Method, [string]$Path, $Body = $null, [switch]$AllowConflict) {
    $params = @{ Uri = "$($script:BaseUrl)$Path"; Method = $Method; Headers = @{}; ErrorAction = 'Stop' }
    if ($script:Token) { $params.Headers.Authorization = "Bearer $($script:Token)" }
    if ($null -ne $Body) { $params.ContentType = 'application/json'; $params.Body = ConvertTo-Json -InputObject $Body -Depth 8 -Compress }
    try { return Invoke-RestMethod @params }
    catch {
        $status = 0
        if ($_.Exception.Response) { $status = [int]$_.Exception.Response.StatusCode }
        if ($AllowConflict -and $status -eq 409) { return $null }
        throw "API $Method $Path failed (HTTP $status): $($_.ErrorDetails.Message)"
    }
}

function Get-Items([string]$Path, [string]$Collection) {
    $response = Invoke-Api GET "${Path}?page=1&limit=100"
    if ($response.PSObject.Properties.Name -contains $Collection) { return @($response.$Collection) }
    return @()
}

function Ensure-Records([string]$Path, [string]$Collection, [object[]]$Records, [scriptblock]$Exists) {
    $items = @(Get-Items $Path $Collection)
    foreach ($record in $Records) {
        if (& $Exists $items $record) { Write-Host "Exists: $($record | ConvertTo-Json -Compress -Depth 4)"; continue }
        $created = Invoke-Api POST $Path $record
        if ($null -ne $created -and $created.PSObject.Properties.Name -contains $Collection.TrimEnd('s')) {
            $items += $created.($Collection.TrimEnd('s'))
        } elseif ($null -ne $created) {
            $items = @(Get-Items $Path $Collection)
        }
        Write-Host "Created in $Path"
    }
}

$script:BaseUrl = $BaseUrl.TrimEnd('/')
$script:Token = $null
$moduleSummary = [System.Collections.Generic.List[object]]::new()
function Invoke-SeedModule([string]$Module, [scriptblock]$Action) {
    try {
        & $Action
        $moduleSummary.Add([pscustomobject]@{ Module = $Module; Status = 'Succeeded'; Error = $null })
    } catch {
        $message = $_.Exception.Message
        Write-Warning "$Module failed: $message"
        $moduleSummary.Add([pscustomobject]@{ Module = $Module; Status = 'Failed'; Error = $message })
    }
}
$deadline = (Get-Date).AddSeconds($HealthTimeoutSeconds)
do {
    try {
        $health = Invoke-RestMethod -Uri "$BaseUrl/health" -Method GET -TimeoutSec 5 -ErrorAction Stop
        if ($health.status -eq 'ok') { break }
    } catch { Start-Sleep -Seconds 2 }
    if ((Get-Date) -ge $deadline) { throw "Gateway health endpoint did not respond at $BaseUrl/health within $HealthTimeoutSeconds seconds." }
} while ($true)

$registration = @{ name = $Name; email = $Email; password = $Password }
Invoke-Api POST '/auth/register' $registration -AllowConflict | Out-Null

$dbUser = Get-ComposeValue 'auth-db' 'POSTGRES_USER'
$dbName = Get-ComposeValue 'auth-db' 'POSTGRES_DB'
$escapedEmail = $Email.Replace("'", "''")
$sql = "UPDATE users SET role = 'admin' WHERE email = '$escapedEmail';"
$dockerArgs = @('compose', 'exec', '-T', 'auth-db', 'psql', '-U', $dbUser, '-d', $dbName, '-c', $sql)
& docker @dockerArgs
if ($LASTEXITCODE -ne 0) { throw 'Could not promote the demo user in the auth database.' }

$login = Invoke-Api POST '/auth/login' @{ email = $Email; password = $Password }
$script:Token = $login.token
if (-not $script:Token) { throw 'Login succeeded without returning an access token.' }

Invoke-SeedModule 'students' {
$script:students = @(
    @{ roll_number='DEMO-2026-001'; first_name='Aarav'; last_name='Rao'; email='aarav.rao.demo@example.edu'; phone='+91-9876501001'; date_of_birth='2005-03-14'; department='Computer Science'; program='B.Tech'; year_of_study=2; status='active' },
    @{ roll_number='DEMO-2026-002'; first_name='Ananya'; last_name='Iyer'; email='ananya.iyer.demo@example.edu'; phone='+91-9876501002'; date_of_birth='2004-11-02'; department='Computer Science'; program='B.Tech'; year_of_study=3; status='active' },
    @{ roll_number='DEMO-2026-003'; first_name='Rohan'; last_name='Mehta'; email='rohan.mehta.demo@example.edu'; phone='+91-9876501003'; date_of_birth='2005-07-21'; department='Electronics'; program='B.Tech'; year_of_study=2; status='active' }
)
Ensure-Records '/students' 'students' $script:students { param($items,$r) @($items | Where-Object roll_number -eq $r.roll_number).Count -gt 0 }
$studentRows = @(Get-Items '/students' 'students')
$script:demoStudents = @($script:students | ForEach-Object { $wanted = $_.roll_number; $studentRows | Where-Object roll_number -eq $wanted | Select-Object -First 1 })
}

Invoke-SeedModule 'courses' {
$courses = @(
    @{ course_code='DEMO-CS201'; title='Data Structures and Algorithms'; description='Core data structures, algorithm design, and complexity analysis.'; credits=4; department='Computer Science'; semester=3; instructor_name='Dr. Meera Nair'; capacity=60; status='active' },
    @{ course_code='DEMO-CS202'; title='Database Management Systems'; description='Relational databases, SQL, normalization, and transactions.'; credits=4; department='Computer Science'; semester=4; instructor_name='Dr. Kiran Rao'; capacity=55; status='active' },
    @{ course_code='DEMO-EC203'; title='Digital Signal Processing'; description='Sampling, digital filters, and signal analysis.'; credits=3; department='Electronics'; semester=4; instructor_name='Prof. Nisha Varma'; capacity=45; status='active' }
)
Ensure-Records '/courses' 'courses' $courses { param($items,$r) @($items | Where-Object course_code -eq $r.course_code).Count -gt 0 }
}

Invoke-SeedModule 'faculty' {
$faculty = @(
    @{ name='Dr. Meera Nair'; employee_code='DEMO-FAC-001'; department='Computer Science'; designation='Associate Professor'; email='meera.nair.demo@example.edu'; phone='+91-9876502001' },
    @{ name='Dr. Kiran Rao'; employee_code='DEMO-FAC-002'; department='Computer Science'; designation='Assistant Professor'; email='kiran.rao.demo@example.edu'; phone='+91-9876502002' },
    @{ name='Prof. Nisha Varma'; employee_code='DEMO-FAC-003'; department='Electronics'; designation='Assistant Professor'; email='nisha.varma.demo@example.edu'; phone='+91-9876502003' }
)
Ensure-Records '/faculty' 'faculties' $faculty { param($items,$r) @($items | Where-Object employee_code -eq $r.employee_code).Count -gt 0 }
}

Invoke-SeedModule 'attendance' {
$studentRows = @(Get-Items '/students' 'students')
$script:demoStudents = @($script:students | ForEach-Object { $wanted = $_.roll_number; $studentRows | Where-Object roll_number -eq $wanted | Select-Object -First 1 })
$attendance = for ($i = 0; $i -lt 3; $i++) { @{ student_id=[int]$script:demoStudents[$i].id; date=@('2026-10-28','2026-10-29','2026-10-30')[$i]; status=@('present','present','absent')[$i]; remarks=@('On time','Participated in lab','Medical leave')[$i] } }
Ensure-Records '/attendance' 'attendances' @($attendance) { param($items,$r) @($items | Where-Object { [int]$_.student_id -eq $r.student_id -and ([string]$_.date).Substring(0,10) -eq $r.date }).Count -gt 0 }
}

Invoke-SeedModule 'exams and results' {
$examRecords = @(
    @{ exam_name='DEMO Data Structures Midterm'; course_code='DEMO-CS201'; exam_date=(Get-Date).AddDays(14).ToString('yyyy-MM-dd'); max_marks=100 },
    @{ exam_name='DEMO Database Systems Quiz'; course_code='DEMO-CS202'; exam_date=(Get-Date).AddDays(21).ToString('yyyy-MM-dd'); max_marks=50 },
    @{ exam_name='DEMO DSP Final'; course_code='DEMO-EC203'; exam_date=(Get-Date).AddDays(28).ToString('yyyy-MM-dd'); max_marks=100 }
)
Ensure-Records '/exams' 'exams' $examRecords { param($items,$r) @($items | Where-Object exam_name -eq $r.exam_name).Count -gt 0 }
$examRows = @(Get-Items '/exams' 'exams')
$demoExams = @($examRecords | ForEach-Object { $wanted = $_.exam_name; $examRows | Where-Object exam_name -eq $wanted | Select-Object -First 1 })
$results = for ($i = 0; $i -lt 3; $i++) { @{ exam_id=[int]$demoExams[$i].id; student_id=[int]$script:demoStudents[$i].id; marks_obtained=[int]@(86,42,78)[$i]; grade=[string]@('A','B+','A-')[$i] } }
Ensure-Records '/results' 'results' @($results) { param($items,$r) @($items | Where-Object { [int]$_.exam_id -eq $r.exam_id -and [int]$_.student_id -eq $r.student_id }).Count -gt 0 }
}

Invoke-SeedModule 'fees' {
$fees = for ($i = 0; $i -lt 3; $i++) { @{ student_id=[int]$script:demoStudents[$i].id; fee_type=@('Tuition - Semester 4','Laboratory fee','Library fee')[$i]; amount=@(48500,3500,1200)[$i]; due_date=(Get-Date).AddDays(30 + $i).ToString('yyyy-MM-dd'); status='pending'; paid_date=$null } }
Ensure-Records '/fees' 'fees' @($fees) { param($items,$r) @($items | Where-Object { [int]$_.student_id -eq $r.student_id -and $_.fee_type -eq $r.fee_type }).Count -gt 0 }
}

Invoke-SeedModule 'notifications' {
$notifications = @(
    @{ title='DEMO: Midterm timetable published'; message='The midterm timetable is available in the student portal. Please review your course dates.'; target_role='student' },
    @{ title='DEMO: Faculty meeting'; message='The department meeting will be held Friday at 3:00 PM in Seminar Room 2.'; target_role='faculty' },
    @{ title='DEMO: Fee payment reminder'; message='Semester fee payments are due in 30 days. Contact the accounts office for assistance.'; target_role='student' }
)
Ensure-Records '/notifications' 'notifications' $notifications { param($items,$r) @($items | Where-Object { $_.title -eq $r.title -and $_.message -eq $r.message }).Count -gt 0 }
}

Write-Host 'Demo data seeding summary:'
$moduleSummary | Format-Table -Wrap -AutoSize
