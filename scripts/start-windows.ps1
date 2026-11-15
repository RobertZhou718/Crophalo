# Crophalo's start on a Windows PC: the twin of scripts/run.sh, the same thirteen steps in the same order, written for the
# Windows PowerShell 5.1 that every Windows 10 and 11 PC has. Options: --no-open, --port N, --login, --no-login. Settings: CROPHALO_PORT, FW_CACHE.
# Pure: Test-Port, ConvertTo-NetrcWord, Get-NetrcLine. The rest reads the folder, the PC or the network.
# No suite can run it on a Mac: scripts/WINDOWS-CHECKLIST.md is its check, by hand on a PC. Keep this file plain ASCII with Windows line ends.

if ($ExecutionContext.SessionState.LanguageMode -ne 'FullLanguage') {   # a work PC locked by its administrator: nothing below may run there
  Write-Host 'This PC is set up so that scripts cannot do their work, so Crophalo cannot set itself up here. Ask whoever looks after this PC, or use another PC.'
  exit 1
}
$Os = [Environment]::OSVersion.Version
if ($Os.Major -lt 10 -or $PSVersionTable.PSVersion.Major -lt 5) {   # asked first: an older Windows PowerShell cannot run the steps below
  Write-Host "Crophalo needs Windows 10 or newer. This PC has Windows $($Os.Major).$($Os.Minor)."
  exit 1
}
$ErrorActionPreference = 'Stop'            # a step that fails must be seen, never passed over in silence
$ProgressPreference = 'SilentlyContinue'   # the download bar of Windows PowerShell makes a download many times slower
$Words = @($args | ForEach-Object { [string]$_ })   # the options, kept before any function gets an $args of its own

# ---- pinned versions and hashes: the versions scripts/portable.sh pins, with the hashes of the Windows files
# Node 22 LTS is supported until the end of April 2027. After that: set $NodeVer to the newest LTS and replace $NodeSha with the
# win-x64.zip line of https://nodejs.org/dist/v<version>/SHASUMS256.txt. A new uv needs the hash in the release's .zip.sha256 file.
$NodeVer = '22.23.5'
$NodeSha = '4a191082e9706866830379d577d2cc8a50c776fcd9436a8d061b063ed0d9a0e3'   # node-v22.23.5-win-x64.zip
$NodeDist = 'https://nodejs.org/dist'
$NodeMin = 20   # the oldest Node the server runs on; the PC's own node is used from here up
$UvVer = '0.13.7'
$UvSha = '0cdc5b38fe5a8168ed6a25814f5ba43c21d313dd3187314fccb37b7cec46e021'     # uv-x86_64-pc-windows-msvc.zip
$UvDist = 'https://github.com/astral-sh/uv/releases/download'
$UvSource = 'https://raw.githubusercontent.com/astral-sh/uv'   # uv's archive holds no licence text: the two it is offered under come from its source at the same version
$UvLicenceSha = @{
  MIT = '860e3d7a86b84e6a7012c7a635fc64df475cebc6cce34dfeb73a5982ec58176c'      # LICENSE-MIT
  APACHE = 'c71d239df91726fc519c6eb72d318ec65820627232b2f796219e87dcf35d0ab4'   # LICENSE-APACHE
}
$PySeries = '3.12'
$PyName = "cpython-$PySeries-windows-x86_64-none"   # uv's name for the Python this PC gets
$Arch = 'win-x64'        # names this PC's tools in runtime\ and in the .venv fingerprint, as arm64 and x86_64 do on a Mac
$WheelTag = 'win_amd64'
$EarthdataHost = 'urs.earthdata.nasa.gov'
$DefaultPort = 5480

# ---- small helpers
$Utf8 = New-Object System.Text.UTF8Encoding($false)   # no byte-order mark: Python and Node read these files exactly as written
$LogFile = $null
function Say([string]$text) { Write-Host $text }
function Add-Log([string]$text) { try { [IO.File]::AppendAllText($LogFile, $text + "`r`n", $Utf8) } catch { } }   # the log is never a reason to stop
function Log([string]$text) { Add-Log ([DateTime]::Now.ToString('yyyy-MM-dd HH:mm:ss', [Globalization.CultureInfo]::InvariantCulture) + ' ' + $text) }
function New-Folder([string]$path) { $null = [IO.Directory]::CreateDirectory($path) }
function Remove-File([string]$path) { try { if ([IO.File]::Exists($path)) { [IO.File]::Delete($path) } } catch { } }
function Move-Over([string]$from, [string]$to) {   # the old file stays until the new one is in its place: Windows swaps the two in one step, never a delete first
  if (-not [IO.File]::Exists($to)) { [IO.File]::Move($from, $to); return }   # a first file: there is nothing to keep
  $before = "$to.before"; Remove-File $before   # left by an earlier swap that ended well: the file itself is in its place
  try { [IO.File]::Replace($from, $to, $before) }
  catch { if (-not [IO.File]::Exists($to) -and [IO.File]::Exists($before)) { [IO.File]::Move($before, $to) }; throw }   # a swap stopped halfway: the old file goes back
  Remove-File $before
}
function Test-Link([string]$path) {   # a link to another place; the marks a cloud drive puts on its own files do not count
  try { $kind = (Get-Item -LiteralPath $path -Force).LinkType; return ($kind -eq 'SymbolicLink' -or $kind -eq 'Junction') } catch { return $false }
}
function Move-Folder([string]$from, [string]$to) {   # a rename, tried a few times: a virus scanner may still be reading a file that was just written
  for ($n = 0; $n -lt 5; $n++) { try { [IO.Directory]::Move($from, $to); return $true } catch { Start-Sleep -Milliseconds 400 } }
  Log "could not move $from to $to"; return $false
}
function Remove-Tree([string]$path) {   # by hand: a link inside is taken away and never followed, and a cloud drive's folders go too
  if (-not (Test-Link $path)) {
    foreach ($file in [IO.Directory]::GetFiles($path)) { [IO.File]::Delete($file) }
    foreach ($sub in [IO.Directory]::GetDirectories($path)) { Remove-Tree $sub }
  }
  [IO.Directory]::Delete($path)
}
function Remove-Folder([string]$path) {   # tried a few times, for the same virus scanner
  for ($n = 0; $n -lt 5 -and [IO.Directory]::Exists($path); $n++) { try { Remove-Tree $path } catch { Start-Sleep -Milliseconds 400 } }
  if ([IO.Directory]::Exists($path)) { Log "could not remove $path" }
}
function Get-Sha256([string]$file) { try { return (Get-FileHash -LiteralPath $file -Algorithm SHA256).Hash.ToLowerInvariant() } catch { return '' } }

function Invoke-Tool([string]$exe, [string[]]$arguments) {   # runs a program; what it prints goes to the log; true when it ended well
  $ErrorActionPreference = 'Continue'   # Windows PowerShell turns a program's error lines into errors of its own: they must not stop the start
  try { & $exe @arguments 2>&1 | ForEach-Object { Add-Log "$_" }; return ($LASTEXITCODE -eq 0) }
  catch { Log "could not run $([IO.Path]::GetFileName($exe)): $($_.Exception.Message)"; return $false }
}
function Get-ToolText([string]$exe, [string[]]$arguments) {   # what a program prints, or nothing when it failed
  $ErrorActionPreference = 'Continue'
  try { $out = & $exe @arguments 2>$null; if ($LASTEXITCODE -ne 0) { return '' }; return (@($out) -join "`n").Trim() } catch { return '' }
}
function Get-Health([int]$port, [int]$ms) {   # the server's own answer on this PC, or nothing; asked directly, never through a proxy
  try {
    $ask = [System.Net.HttpWebRequest]::Create("http://127.0.0.1:$port/api/health")
    $ask.Proxy = $null; $ask.Timeout = $ms; $ask.ReadWriteTimeout = $ms
    $answer = $ask.GetResponse()
    try { return ((New-Object System.IO.StreamReader($answer.GetResponseStream())).ReadToEnd() | ConvertFrom-Json) } finally { $answer.Close() }
  } catch { return $null }
}
function Open-Browser { try { Start-Process $Url } catch { Say "Open this address in your browser: $Url" } }

trap {   # anything unforeseen: plain words for the person, the detail for the log
  Say "Crophalo stopped: $($_.Exception.Message)"
  Say 'The record of the setup is in runtime\setup.log inside this folder.'
  Log "stopped at line $($_.InvocationInfo.ScriptLineNumber): $($_.Exception.GetType().FullName): $($_.Exception.Message)"
  exit 1
}

# ---- 1 - the folder, from this script's own place
$Root = [IO.Path]::GetDirectoryName($PSScriptRoot)
if (-not $Root) { Say 'Crophalo could not find its own folder.'; exit 1 }
foreach ($need in 'scripts\serve.mjs', 'scripts\portable.sh', 'scripts\requirements.txt') {
  if (-not [IO.File]::Exists("$Root\$need")) {
    Say "This is not a whole Crophalo folder ($need is missing). Copy the whole folder again; the hidden parts must come along."; exit 1
  }
}
Set-Location -LiteralPath $Root; [Environment]::CurrentDirectory = $Root   # both: Windows PowerShell and the programs it starts each keep their own
$RT = "$Root\runtime"
[Environment]::SetEnvironmentVariable('PYTHONPATH', $null); [Environment]::SetEnvironmentVariable('PYTHONHOME', $null)   # another program's Python settings must not reach Crophalo's own Python
$PyImports = ''   # the six library names live in portable.sh; they are read, never copied
$found = [regex]::Match([IO.File]::ReadAllText("$Root\scripts\portable.sh"), "(?m)^PY_IMPORTS='([A-Za-z0-9_, ]+)'")
if ($found.Success) { $PyImports = $found.Groups[1].Value }

function Show-Usage { Say 'Use: "Start Crophalo.bat" [--no-open] [--port N] [--login] [--no-login]' }
function Test-Port([string]$p) { return ($p -match '^[0-9]{1,5}$' -and [int]$p -ge 1024 -and [int]$p -le 65535) }
$Open = $true; $Ask = 'auto'; $Port = ''; $Running = $false
for ($i = 0; $i -lt $Words.Count; $i++) {
  $word = $Words[$i]; $key = $word.TrimStart('-').ToLowerInvariant().Replace('-', '')   # --no-open and -NoOpen are one option
  if ($word -notlike '-*') { Say "Unknown option: $word"; Show-Usage; exit 2 }
  elseif ($key -eq 'noopen') { $Open = $false }
  elseif ($key -eq 'port') { if ($i + 1 -ge $Words.Count) { Show-Usage; exit 2 }; $i++; $Port = $Words[$i] }
  elseif ($key -like 'port=*') { $Port = $word.Substring($word.IndexOf('=') + 1) }
  elseif ($key -eq 'login') { $Ask = 'yes' }
  elseif ($key -eq 'nologin') { $Ask = 'no' }
  elseif ($key -eq 'h' -or $key -eq 'help') { Show-Usage; exit 0 }
  else { Say "Unknown option: $word"; Show-Usage; exit 2 }
}

# ---- 2 - remember the port: a browser keeps Crophalo's saved fields per address, so a new port would look like a new browser
if (-not $Port) { $Port = [string]$env:CROPHALO_PORT }
if ($Port) {
  if (-not (Test-Port $Port)) { Say "The port must be a number from 1024 to 65535, not `"$Port`"."; exit 2 }
} else {
  try { $Port = ([IO.File]::ReadAllText("$RT\last-port")).Trim() } catch { $Port = '' }
  if (-not (Test-Port $Port)) { $Port = [string]$DefaultPort }
}
$Port = [int]$Port

# ---- 3 - can the folder be written to?
function Test-Writable {   # the folder itself and runtime\: .venv, .cache and the saved fields are made at the top, so a writable runtime\ alone is not enough
  try {
    New-Folder $RT
    foreach ($dir in $Root, $RT) { [IO.File]::WriteAllText("$dir\.write-test-$PID", '', $Utf8); [IO.File]::Delete("$dir\.write-test-$PID") }
    return $true
  } catch { return $false }
}
if (-not (Test-Writable)) { Say 'This folder cannot be written to. Copy the whole Crophalo folder onto this PC (for example to C:\Crophalo).'; exit 1 }
$LogFile = "$RT\setup.log"
try {   # the log never grows without end
  $lines = [IO.File]::ReadAllLines($LogFile)
  if ($lines.Count -gt 4000) { [IO.File]::WriteAllLines($LogFile, [string[]]@($lines | Select-Object -Last 2000), $Utf8) }
} catch { }
$Chip = [string]$env:PROCESSOR_ARCHITEW6432; if (-not $Chip) { $Chip = [string]$env:PROCESSOR_ARCHITECTURE }   # true to the PC, also from a 32-bit window
Log "start in $Root (Windows $($Os.Major).$($Os.Minor).$($Os.Build), $Chip)"

# ---- 4 - take Windows's download flag off every file, so the tools inside the folder run without a warning
function Test-Flag([string]$file) { try { return ($null -ne (Get-Item -LiteralPath $file -Stream 'Zone.Identifier' -ErrorAction SilentlyContinue)) } catch { return $false } }
function Get-FilesBelow([string]$top) {   # every file under a folder; a link to another place is not followed
  $todo = New-Object System.Collections.Generic.Stack[string]; $todo.Push($top)
  while ($todo.Count -gt 0) {
    $dir = $todo.Pop()
    try {
      foreach ($file in [IO.Directory]::GetFiles($dir)) { $file }
      foreach ($sub in [IO.Directory]::GetDirectories($dir)) { if (-not (Test-Link $sub)) { $todo.Push($sub) } }
    } catch { }
  }
}
if (Test-Flag $PSCommandPath) {   # the flag arrives with the whole folder (an unpacked zip), so this one file tells for all: later starts search nothing
  $freed = 0
  $flagged = @(Get-FilesBelow $Root | Where-Object { $_ -ine $PSCommandPath -and (Test-Flag $_) }) + $PSCommandPath   # this file last: a search that was cut short starts again
  foreach ($file in $flagged) { try { Unblock-File -LiteralPath $file; $freed++ } catch { Log "the download flag stays on $file" } }
  Say "Took the Windows download flag off $freed file$(if ($freed -ne 1) { 's' }), so Crophalo's own tools can run."; Log "download flag removed from $freed files"
}

# ---- 5 - which PC: the tools are made for 64-bit Intel and AMD chips
if ($Chip -eq 'ARM64' -and $Os.Build -ge 22000) {
  Say 'This PC has an Arm chip. Crophalo''s tools are made for Intel and AMD chips; Windows 11 can run them, a little slower.'; Log 'arm chip: the Intel and AMD tools are used'
} elseif ($Chip -ne 'AMD64') {
  Say "Crophalo needs a 64-bit Windows PC with an Intel or AMD chip. This PC is of another kind ($Chip)."; Log "stopped: chip $Chip"; exit 1
}

# ---- 6 - already running from this folder? then only open the browser. The server names its own folder (root) in /api/health;
#      the cache is no sign of it, since two folders may share one FW_CACHE. With --login (the "Add NASA login" starter) the login
#      is asked first, in step 9; the Python set-up is left alone meanwhile, and the start ends there, with no second server
$Url = "http://localhost:$Port/"
$RootFull = [IO.Path]::GetFullPath($Root)   # as the server names it in /api/health
$health = Get-Health $Port 3000
if ($health -and ([string]$health.root) -ieq $RootFull) {   # capitals do not tell two Windows folders apart
  if ($Ask -ne 'yes') { Say "Crophalo is already running from this folder: $Url"; Log "already running on $Port"; if ($Open) { Open-Browser }; exit 0 }
  $Running = $true
}

# ---- downloads: each file into FILE.part first, so a half file never looks like a whole one
function Get-Download([string]$url, [string]$file) {
  Log "download $url"
  New-Folder ([IO.Path]::GetDirectoryName($file))
  [Net.ServicePointManager]::SecurityProtocol = [Net.ServicePointManager]::SecurityProtocol -bor [Net.SecurityProtocolType]::Tls12   # an early Windows 10 offers only older ways that these sites refuse
  for ($n = 1; $n -le 3; $n++) {
    try { Invoke-WebRequest -Uri $url -OutFile "$file.part" -UseBasicParsing -TimeoutSec 60; Move-Over "$file.part" $file; return $true }
    catch { Log "download try $n failed: $($_.Exception.Message)"; Start-Sleep -Seconds 2 }
  }
  Log "download failed $url"; return $false
}
function Get-PublishedHash([string]$listFile, [string]$name) {   # the first word of the line that names the file; of the first line when no name is asked
  try {
    foreach ($line in [IO.File]::ReadAllLines($listFile)) {
      $w = @($line.Trim() -split '\s+')
      if (-not $name -or ($w.Count -ge 2 -and $w[1].TrimStart('*') -eq $name)) { return $w[0].ToLowerInvariant() }
    }
  } catch { }
  return ''
}
function Test-Download([string]$file, [string]$pinned, [string]$published) {   # kept only when its SHA-256 equals both the hash pinned here and the publisher's
  $got = Get-Sha256 $file; $name = [IO.Path]::GetFileName($file)
  if ($got -and $got -eq $pinned -and $got -eq $published) { Log "checksum ok $name"; return $true }
  if (-not $got) { $got = 'unreadable' }; if (-not $published) { $published = 'not found' }
  Log "checksum MISMATCH ${name}: file $got, pinned $pinned, publisher $published"
  Remove-File $file; return $false
}
function Expand-Some([string]$zip, [string]$dest, [string[]]$wanted) {   # only the named files leave the zip, each straight into DEST
  try {
    Add-Type -AssemblyName System.IO.Compression, System.IO.Compression.FileSystem
    New-Folder $dest; $taken = 0
    $archive = [IO.Compression.ZipFile]::OpenRead($zip)
    try {
      foreach ($entry in $archive.Entries) {
        if ($wanted -notcontains $entry.FullName.Replace('\', '/')) { continue }
        [IO.Compression.ZipFileExtensions]::ExtractToFile($entry, "$dest\$($entry.Name)", $true)
        [IO.File]::SetLastWriteTime("$dest\$($entry.Name)", [DateTime]::Now); $taken++   # dated the day it was unpacked here, as on a Mac
      }
    } finally { $archive.Dispose() }
    return ($taken -eq $wanted.Count)
  } catch { Log "could not unpack $([IO.Path]::GetFileName($zip)): $($_.Exception.Message)"; return $false }
}
function Expand-Checked([string]$dir, [string]$zip, [string]$pinned, [string]$published, [string[]]$wanted) {   # check the download, then unpack it beside the target, as DIR.part
  if (-not (Test-Download $zip $pinned $published)) { return $false }
  Remove-Folder "$dir.part"
  return (Expand-Some $zip "$dir.part" $wanted)
}
function Set-Folder([string]$dir) { Remove-Folder $dir; return (Move-Folder "$dir.part" $dir) }   # a half folder of that name is replaced, never nested into

# ---- 7 - Node: the folder's own, else the PC's when new enough, else a checked download
function Test-Node([string]$exe) {
  if (-not $exe -or -not [IO.File]::Exists($exe)) { return $false }
  $major = Get-ToolText $exe @('-p', "process.versions.node.split('.')[0]")
  return ($major -match '^[0-9]+$' -and [int]$major -ge $NodeMin)
}
function Get-Node {   # only node.exe and LICENSE, into runtime\node-win-x64
  $dir = "$RT\node-$Arch"; $name = "node-v$NodeVer-win-x64"; $zip = "$RT\downloads\$name.zip"; $list = "$RT\downloads\node-$NodeVer-SHASUMS256.txt"
  if ([IO.File]::Exists("$dir\node.exe")) { return $true }
  if (-not (Get-Download "$NodeDist/v$NodeVer/SHASUMS256.txt" $list)) { return $false }
  if (-not (Get-Download "$NodeDist/v$NodeVer/$name.zip" $zip)) { return $false }
  $whole = (Expand-Checked $dir $zip $NodeSha (Get-PublishedHash $list "$name.zip") @("$name/node.exe", "$name/LICENSE")) -and (Set-Folder $dir)
  if (-not $whole) { return $false }
  Remove-File $zip; Remove-File $list; return $true
}
$Node = "$RT\node-$Arch\node.exe"
if (-not (Test-Node $Node)) {
  $onPc = Get-Command node.exe -CommandType Application -ErrorAction SilentlyContinue | Select-Object -First 1
  $Node = ''; if ($onPc) { $Node = $onPc.Path }
  if (-not (Test-Node $Node)) {
    Say "Getting Node $NodeVer for Crophalo (about 36 MB, once)..."
    $Node = "$RT\node-$Arch\node.exe"
    if (-not ((Get-Node) -and (Test-Node $Node))) {
      Say 'Crophalo needs Node to run and could not get it. Check the internet connection, then start again. Details: runtime\setup.log'; exit 1
    }
  }
}
Log "node $Node"

# ---- 8 - Python 3.12 and the six libraries in .venv, rebuilt only when its fingerprint no longer matches
$Venv = "$Root\.venv"; $Stamp = "$Venv\crophalo-venv.txt"; $VenvPy = "$Venv\Scripts\python.exe"; $Uv = "$RT\uv-$Arch\uv.exe"; $Why = ''
$InFolder = @{   # everything uv and pip keep stays inside the folder: nothing in the home folder, no outside settings
  UV_PYTHON_INSTALL_DIR = "$RT\python"; UV_PYTHON_BIN_DIR = "$RT\python\bin"; UV_CACHE_DIR = "$RT\uv-cache"
  UV_NO_CONFIG = '1'; UV_MANAGED_PYTHON = '1'; UV_PYTHON_DOWNLOADS = 'manual'; UV_NO_PROGRESS = '1'
  PIP_CONFIG_FILE = 'nul'; PIP_NO_CACHE_DIR = '1'; PIP_DISABLE_PIP_VERSION_CHECK = '1'; PIP_NO_INPUT = '1'; PYTHONNOUSERSITE = '1'
  TEMP = "$RT\tmp"; TMP = "$RT\tmp"
}
function Invoke-InFolder([string]$exe, [string[]]$arguments) {   # run uv or pip with those settings, then put the PC's own back
  New-Folder "$RT\tmp"; New-Folder "$RT\python"; New-Folder "$RT\uv-cache"
  $before = @{}
  foreach ($key in $InFolder.Keys) { $before[$key] = [Environment]::GetEnvironmentVariable($key); [Environment]::SetEnvironmentVariable($key, $InFolder[$key]) }
  try { return (Invoke-Tool $exe $arguments) }
  finally { foreach ($key in $InFolder.Keys) { [Environment]::SetEnvironmentVariable($key, $before[$key]) } }
}
function Test-Uv { return ([IO.File]::Exists("$RT\uv-$Arch\uv.exe") -and [IO.File]::Exists("$RT\uv-$Arch\LICENSE-MIT") -and [IO.File]::Exists("$RT\uv-$Arch\LICENSE-APACHE")) }   # whole only with its licence texts
function Get-UvLicence([string]$dir, [string]$name) {   # one licence text beside uv.exe, kept only when it equals the hash pinned here
  if (-not (Get-Download "$UvSource/$UvVer/LICENSE-$name" "$dir\LICENSE-$name")) { return $false }
  if ((Get-Sha256 "$dir\LICENSE-$name") -eq $UvLicenceSha[$name]) { Log "checksum ok uv LICENSE-$name"; return $true }
  Log "checksum MISMATCH uv LICENSE-$name"; Remove-File "$dir\LICENSE-$name"; return $false
}
function Get-Uv {   # uv.exe and the two licence texts, into runtime\uv-win-x64
  $dir = "$RT\uv-$Arch"; $name = 'uv-x86_64-pc-windows-msvc.zip'; $zip = "$RT\downloads\uv-$UvVer-$name"
  if (Test-Uv) { return $true }
  if (-not (Get-Download "$UvDist/$UvVer/$name.sha256" "$zip.sha256")) { return $false }
  if (-not (Get-Download "$UvDist/$UvVer/$name" $zip)) { return $false }
  $whole = (Expand-Checked $dir $zip $UvSha (Get-PublishedHash "$zip.sha256" '') @('uv.exe')) -and
    (Get-UvLicence "$dir.part" 'MIT') -and (Get-UvLicence "$dir.part" 'APACHE') -and (Set-Folder $dir)
  if (-not $whole) { return $false }
  Remove-File $zip; Remove-File "$zip.sha256"; return $true
}
function Find-Python {   # the folder's own Python (the newest patch), or nothing
  $python = ''; $best = -1
  try {
    foreach ($dir in [IO.Directory]::GetDirectories("$RT\python", "cpython-$PySeries.*-windows-x86_64-none")) {
      # Only real folders: uv also leaves a link "cpython-3.12-windows-..." that holds the full path of the folder it was made in,
      # so in a copied folder it leads back into the old one.
      $patch = [IO.Path]::GetFileName($dir).Substring("cpython-$PySeries.".Length).Split('-')[0]
      if ($patch -match '^[0-9]+$' -and [int]$patch -gt $best -and -not (Test-Link $dir) -and [IO.File]::Exists("$dir\python.exe")) { $best = [int]$patch; $python = "$dir\python.exe" }
    }
  } catch { }
  return $python
}
function Get-Python {   # through uv (it checks its own hash list), into runtime\python; --no-registry: uv writes nothing about it into Windows itself
  if (Find-Python) { return $true }
  $null = Invoke-InFolder $Uv @('python', 'install', '--no-bin', '--no-registry', $PyName)
  return [bool](Find-Python)
}
function Test-Wheels {
  $want = Get-Sha256 "$Root\scripts\requirements.txt"; $have = ''
  try { $have = ([IO.File]::ReadAllText("$RT\wheels\$Arch\.complete")).Trim() } catch { }
  return ($want -and $have -eq $want)
}
function Get-Wheels {   # every library file for this PC into runtime\wheels\win-x64
  if (Test-Wheels) { return $true }
  $python = Find-Python; if (-not $python) { return $false }
  New-Folder "$RT\wheels\$Arch"
  $got = Invoke-InFolder $python @('-m', 'pip', 'download', '--only-binary=:all:', '--platform', $WheelTag, '--python-version', $PySeries,
    '--implementation', 'cp', '--abi', ('cp' + $PySeries.Replace('.', '')), '-d', "$RT\wheels\$Arch", '-r', "$Root\scripts\requirements.txt")
  if (-not $got) { return $false }
  [IO.File]::WriteAllText("$RT\wheels\$Arch\.complete", (Get-Sha256 "$Root\scripts\requirements.txt") + "`n", $Utf8)   # written last: a half-filled folder never counts as packed
  return $true
}
function Get-PyVersion([string]$python) { return (Get-ToolText $python @('-c', 'import platform; print(platform.python_version())')) }
function Get-VenvStamp([string]$version) {
  $req = Get-Sha256 "$Root\scripts\requirements.txt"
  return "crophalo-venv 1`narch=$Arch`npython=$version`nrequirements=$req`nfolder=$Root`n"
}
function Test-Imports { return (Invoke-Tool $VenvPy @('-c', "import $PyImports")) }
function Test-Venv {   # the folder path is part of the fingerprint: a moved copy keeps the old path inside its venv and would fail without a word
  if ((Test-Link $Venv) -or -not $PyImports -or -not [IO.File]::Exists($Stamp) -or -not [IO.File]::Exists($VenvPy)) { return $false }
  $python = Find-Python; if (-not $python) { return $false }
  try { $have = [IO.File]::ReadAllText($Stamp).Replace("`r", '').TrimEnd() } catch { return $false }
  if ($have -ine (Get-VenvStamp (Get-PyVersion $python)).TrimEnd()) { return $false }   # capitals do not tell two Windows folders apart
  return (Test-Imports)
}
function Build-Venv {   # sets $Why when it fails; Crophalo's own old venv comes back then
  if (-not $PyImports) { $script:Why = 'the list of the NASA data libraries could not be read (scripts\portable.sh)'; return $false }
  if (-not (Get-Uv)) { $script:Why = 'the Python installer (uv) could not be downloaded'; return $false }
  if (-not (Get-Python)) { $script:Why = "Python $PySeries could not be downloaded"; return $false }
  if (-not (Get-Wheels)) { $script:Why = 'the NASA data libraries could not be downloaded'; return $false }
  $python = Find-Python
  $here = (Test-Link $Venv) -or [IO.Directory]::Exists($Venv) -or [IO.File]::Exists($Venv)
  if ($here -and ((Test-Link $Venv) -or -not [IO.File]::Exists($Stamp))) {   # someone else's: moved aside, never deleted
    New-Folder "$RT\old"; $to = "$RT\old\venv-previous"; $i = 1
    while ((Test-Link $to) -or [IO.Directory]::Exists($to) -or [IO.File]::Exists($to)) { $i++; $to = "$RT\old\venv-previous-$i" }
    if (-not (Move-Folder $Venv $to)) { $script:Why = 'the .venv that was here could not be moved aside'; return $false }
    Log "a .venv that is not Crophalo's was moved to $to"
  } elseif ($here) {
    Remove-Folder "$RT\venv-before"
    if (-not (Move-Folder $Venv "$RT\venv-before")) { $script:Why = 'the old .venv could not be moved aside'; return $false }
  }
  $built = (Invoke-InFolder $Uv @('venv', '--python', $python, $Venv)) -and
    (Invoke-InFolder $Uv @('pip', 'install', '--python', $VenvPy, '--no-index', '--find-links', "$RT\wheels\$Arch", '--no-cache', '-r', "$Root\scripts\requirements.txt")) -and
    (Test-Imports)
  if ($built) {
    [IO.File]::WriteAllText($Stamp, (Get-VenvStamp (Get-PyVersion $python)), $Utf8); Remove-Folder "$RT\venv-before"; Log 'venv built'; return $true
  }
  Remove-Folder $Venv
  if ([IO.Directory]::Exists("$RT\venv-before")) { $null = Move-Folder "$RT\venv-before" $Venv }
  $script:Why = 'the NASA data libraries could not be installed'; return $false
}
# The six libraries have ready-built files for every 64-bit Windows 10 and 11, so no Windows that got this far is too old for them.
if ($Running) { } elseif (Test-Venv) { Log 'venv reused: its fingerprint matches and the six libraries load' } else {   # while it runs, the server uses this .venv: it is left as it is
  Say 'Setting up Python and the NASA data tools inside this folder (a few minutes, once)...'
  if (Build-Venv) { Say 'The NASA data tools are ready.' }
}
if ($Why) {
  Say "The NASA data tools are not set up: $Why. Crophalo still opens; the satellite and data-server parts stay empty until this is fixed."
  if ($Root.Length -gt 100) { Say 'This folder sits deep on the disk, and Windows refuses very long file names. Moving the Crophalo folder to C:\Crophalo may fix this.' }
  Log "python not set up: $Why"
}

# ---- 9 - the NASA Earthdata login: asked once, in a window a person can type in; nothing of it is ever shown or logged
# The NASA library (earthaccess 0.11.0) and Python's own netrc reader look for ".netrc" in the home folder on Windows too
# (not "_netrc"), and so does scripts/earthdata.mjs: that is the file written here.
$HomeDir = [string]$env:USERPROFILE; if (-not $HomeDir) { $HomeDir = [Environment]::GetFolderPath('UserProfile') }   # the folder Python and Node call home
# A login counts only as the server counts it (an active entry with both a login and a password, in the folder, the settings or .netrc):
# scripts\earthdata.mjs answers "yes <where>" or "no", and never prints the login itself.
function Test-Login {
  return ((Get-ToolText $Node @("$Root\scripts\earthdata.mjs")) -like 'yes *')
}
function ConvertTo-NetrcWord([string]$value) {   # a value with anything but A-Za-z0-9 . _ @ + = , : / - goes in "quotes", with \ and " escaped
  if ($value -eq '' -or $value -cmatch '[^A-Za-z0-9._@+=,:/-]') { return '"' + $value.Replace('\', '\\').Replace('"', '\"') + '"' }
  return $value
}
function Get-NetrcLine([string]$user, [string]$pass) { return "machine $EarthdataHost login $(ConvertTo-NetrcWord $user) password $(ConvertTo-NetrcWord $pass)`n" }
function Get-OtherLogins([string]$file) {   # the bytes of a netrc file without its NASA entry, word by word (another service on the same line stays): the same code as on a Mac
  $said = Get-ToolText $Node @("$Root\scripts\earthdata.mjs", '--others', $file, '--base64')   # base64: Windows PowerShell would change the letters of plain text on the way
  if ($said -notlike 'ok:*') { throw 'the other entries of the netrc file could not be read' }   # then nothing is written
  return ,([Convert]::FromBase64String($said.Substring(3)))   # the comma keeps the bytes one array
}
function Get-RealFile([string]$file) {   # where a link leads in the end (a .netrc kept in another folder stays a link to it)
  for ($n = 0; $n -lt 16 -and (Test-Link $file); $n++) {
    $target = [string](@((Get-Item -LiteralPath $file -Force).Target)[0])
    if (-not $target) { break }
    if (-not [IO.Path]::IsPathRooted($target)) { $target = [IO.Path]::Combine([IO.Path]::GetDirectoryName($file), $target) }
    $file = [IO.Path]::GetFullPath($target)
  }
  return $file
}
function Protect-File([string]$path, [string]$rights) {   # only this user may open it: what mode 600 (a file) and 700 (a folder) are on a Mac
  $me = [Security.Principal.WindowsIdentity]::GetCurrent().User.Value
  return (Invoke-Tool "$env:SystemRoot\System32\icacls.exe" @($path, '/inheritance:r', '/grant:r', "*${me}:$rights"))
}
function Save-Login([string]$file, [string]$user, [string]$pass) {   # written whole beside the real file, then renamed over it; sets $Closed when only this user can read it
  $real = ''
  try {
    $real = Get-RealFile $file; if (Test-Link $real) { return $false }   # links that lead in a circle: nothing is written
    New-Folder ([IO.Path]::GetDirectoryName($real))
    $kept = [byte[]]@(); if ([IO.File]::Exists($real)) { $kept = Get-OtherLogins $real }   # other services' entries go back exactly as they were
    [IO.File]::WriteAllText("$real.part", '', $Utf8)   # made empty and closed to others first, so the login is never in a file others can open
    $script:Closed = Protect-File "$real.part" 'F'
    [IO.File]::WriteAllBytes("$real.part", [byte[]]($kept + $Utf8.GetBytes((Get-NetrcLine $user $pass))))
    if ([IO.File]::Exists($real) -and -not (Protect-File $real 'F')) { $script:Closed = $false }   # the swap keeps the old file's rights, so the old file is closed to others first
    Move-Over "$real.part" $real
    return $true
  } catch {
    Log "the login could not be saved: $($_.Exception.Message)"
    if ($real) { Remove-File "$real.part" }   # a half-written copy must not stay behind
    return $false
  }
}
function Read-Login {
  Say ''
  Say 'Crophalo reads five NASA satellite products for your field. They need a free NASA Earthdata login:'
  Say '  soil moisture (SMAP), groundwater (GRACE-FO), land temperature (ECOSTRESS),'
  Say '  crop greenness (HLS) and wood in the trees (GEDI).'
  Say 'No login yet? Make one, free: https://urs.earthdata.nasa.gov/users/new'
  Say 'To skip, press Enter. Crophalo still opens; the satellite parts then say they could not be read.'
  $user = [string](Read-Host 'NASA Earthdata username')
  if (-not $user) {
    [IO.File]::WriteAllText("$RT\earthdata-skipped", '', $Utf8); Log 'earthdata login skipped'
    Say 'Skipped. To add the login later: double-click "Start Crophalo (Add NASA login).bat"'; return
  }
  $hidden = Read-Host 'Password (only stars show while you type)' -AsSecureString
  $pass = ''; $raw = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($hidden)   # plain only in memory, only until the file is written
  try { $pass = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($raw) } finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($raw); $hidden.Dispose() }
  if (-not $pass) { $user = $null; Say 'No password was typed, so nothing was saved. Crophalo asks again at the next start.'; return }
  Say 'Where should Crophalo keep this login?'
  Say '  1  Only on this PC (the file .netrc in your home folder)'
  Say '  2  Inside the Crophalo folder (.secrets, so it moves with the folder)'
  $place = 'x'
  while ($place -ne '' -and $place -ne '1' -and $place -ne '2') { $place = ([string](Read-Host 'Type 1 or 2, then Enter (Enter alone means 1)')).Trim() }
  $saved = $false; $script:Closed = $true
  if ($place -eq '2') {
    $saved = Save-Login "$Root\.secrets\earthdata.netrc" $user $pass
    if ($saved) {
      if (-not (Protect-File "$Root\.secrets" '(OI)(CI)F')) { $script:Closed = $false }
      Say 'Saved inside the Crophalo folder (.secrets), so it moves with the folder.'; Log 'earthdata login saved (folder)'; Remove-File "$RT\earthdata-skipped"
    } else { Say 'The login could not be saved in the Crophalo folder.' }
  } else {
    if ($HomeDir) { $saved = Save-Login "$HomeDir\.netrc" $user $pass }
    if ($saved) {
      Say 'Saved in your home folder (.netrc), so it stays on this PC.'; Log 'earthdata login saved (home)'; Remove-File "$RT\earthdata-skipped"
      Remove-File "$Root\.secrets\earthdata.netrc"   # an older login in the folder would be found first and hide this one
    } else { Say 'The login could not be saved in your home folder.' }
  }
  if ($saved -and $Running) { Say 'The running Crophalo uses this login from its next lookup.' }
  if ($saved -and -not $Closed) { Say 'This disk cannot close a file to other people, so anyone who can open that folder can read the saved login.'; Log 'the saved login could not be closed to other users' }
  $user = $null; $pass = $null   # blanked: nothing of the login stays in this window
}
$CanAsk = $false
try { $CanAsk = [Environment]::UserInteractive -and -not [Console]::IsInputRedirected -and -not [Console]::IsOutputRedirected } catch { }
if ($Ask -eq 'yes') {
  if ($CanAsk) { Read-Login } else { Say 'The NASA login can only be typed in a window: double-click "Start Crophalo (Add NASA login).bat".' }
} elseif ($Ask -eq 'auto') {
  if (-not (Test-Login) -and -not [IO.File]::Exists("$RT\earthdata-skipped") -and $CanAsk) { Read-Login }
}
if ($Running) { Say "Crophalo is already running from this folder: $Url"; Log "already running on $Port (login asked)"; if ($Open) { Open-Browser }; exit 0 }   # step 6 found it running: nothing more is started

# ---- 10 - the check-up: plain lines, never blocks the start
$env:FW_PYTHON = $VenvPy
if ([IO.File]::Exists("$Root\scripts\preflight.mjs")) {
  try { & $Node "$Root\scripts\preflight.mjs" --doctor } catch { Log "the check-up could not run: $($_.Exception.Message)" }
}

# ---- 11 - a free port: the remembered one or one of the 49 after it; free means nobody answers on 127.0.0.1 or ::1 and it can be taken
$FindPort = @'
const net = require('net'), first = +process.argv[1];
const answers = (host, port) => new Promise(done => { const s = net.connect({ host, port }); const end = v => { s.destroy(); done(v); };
  s.setTimeout(800, () => end(false)); s.on('connect', () => end(true)); s.on('error', () => end(false)); });
const binds = port => new Promise(done => { const s = net.createServer(); s.once('error', () => done(false)); s.listen(port, '127.0.0.1', () => s.close(() => done(true))); });
(async () => { for (let p = first; p < first + 50 && p < 65536; p++)
  if (!(await answers('127.0.0.1', p)) && !(await answers('::1', p)) && await binds(p)) return console.log(p);
  process.exit(1); })();
'@
$Wanted = $Port
$free = Get-ToolText $Node @('-e', ($FindPort -replace '\s*\r?\n\s*', ' '), "$Wanted")   # on one line and with no double quote in it: Windows PowerShell hands neither over whole
if (-not (Test-Port $free)) {
  Say "No free port from $Wanted to $($Wanted + 49). Close other programs, or start on another port: `"Start Crophalo.bat`" --port 8080"; exit 1
}
$Port = [int]$free
[IO.File]::WriteAllText("$RT\last-port", "$Port`n", $Utf8)
if ($Port -ne $Wanted) { Say "Port $Wanted is in use by another program, so Crophalo uses $Port. Your saved fields come back from the Crophalo folder." }
$Url = "http://localhost:$Port/"; Log "port $Port"

# ---- 12 and 13 - the server starts in this same window, so Ctrl-C or closing the window stops it; it listens on this computer only.
#      This script waits beside it: when the server answers (two minutes at most) it says so and opens the browser.
$env:PORT = "$Port"; $env:HOST = '127.0.0.1'
$begin = New-Object System.Diagnostics.ProcessStartInfo
$begin.FileName = $Node; $begin.Arguments = '"' + "$Root\scripts\serve.mjs" + '"'; $begin.WorkingDirectory = $Root
$begin.UseShellExecute = $false   # no window of its own: it shares this one, with the settings above
$Server = [System.Diagnostics.Process]::Start($begin)
$said = $false; $clock = [Diagnostics.Stopwatch]::StartNew()
try {
  while (-not $Server.HasExited) {
    if (-not $said -and $clock.Elapsed.TotalSeconds -lt 120) {
      $now = Get-Health $Port 2000
      if ($now -and $now.ok -eq $true) { $said = $true; Say "Crophalo is running: $Url"; if ($Open) { Open-Browser } }
    }
    Start-Sleep -Milliseconds 500
  }
} finally {   # also after Ctrl-C: the server got the same Ctrl-C and stops by itself; no program of Crophalo's is left behind
  if (-not $Server.HasExited) { $null = $Server.WaitForExit(10000) }
  if (-not $Server.HasExited) { try { $null = & "$env:SystemRoot\System32\taskkill.exe" /PID $Server.Id /T /F 2>&1 } catch { } }
}
exit $Server.ExitCode
