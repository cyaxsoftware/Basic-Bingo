# GitHub-hosted Windows CI only. This launches real Electron windows on the disposable VM.
[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

if ($env:GITHUB_ACTIONS -ne 'true' -or $env:RUNNER_ENVIRONMENT -ne 'github-hosted' -or $env:RUNNER_OS -ne 'Windows') {
    throw 'Packaged smoke runs only on a GitHub-hosted Windows runner. No app was launched.'
}
if ([Diagnostics.Process]::GetCurrentProcess().SessionId -eq 0) {
    throw 'The Windows runner needs an interactive desktop for UI Automation.'
}

$appData = [Environment]::GetFolderPath([Environment+SpecialFolder]::ApplicationData)
if ([string]::IsNullOrWhiteSpace($appData)) { throw 'Windows did not return an application data directory.' }
$profile = Join-Path $appData 'Basic Bingo'
$legacyProfile = Join-Path $appData 'Offline Bingo Display'
if ((Test-Path -LiteralPath $profile) -or (Test-Path -LiteralPath $legacyProfile)) {
    throw 'Expected a fresh Basic Bingo profile. No existing app data was opened.'
}

$root = Split-Path -Parent $PSScriptRoot
$package = Join-Path (Join-Path $root 'out') 'Basic Bingo-win32-x64'
$executable = (Resolve-Path -LiteralPath (Join-Path $package 'basic-bingo.exe')).Path
$asar = Join-Path (Join-Path $package 'resources') 'app.asar'
if (-not (Test-Path -LiteralPath $asar -PathType Leaf)) { throw 'Missing packaged app.asar.' }
$fuseCheck = Join-Path (Join-Path $PSScriptRoot 'packaging') 'verifyReleaseFuses.mjs'
& node $fuseCheck $executable
if ($LASTEXITCODE -ne 0) { throw 'The packaged executable failed its production fuse check.' }

Add-Type -AssemblyName UIAutomationClient
Add-Type -AssemblyName UIAutomationTypes

function Wait-ForElement($process, [string]$description, [scriptblock]$probe) {
    $clock = [Diagnostics.Stopwatch]::StartNew()
    while ($clock.Elapsed.TotalSeconds -lt 30) {
        if ($process.HasExited) { throw "Basic Bingo exited ($($process.ExitCode)) while waiting for $description." }
        try {
            $element = & $probe
            if ($null -ne $element) { return $element }
        } catch [System.Windows.Automation.ElementNotAvailableException] {
            # Chromium may replace an accessibility node during a render. Query it again.
        }
        Start-Sleep -Milliseconds 200
    }
    throw "Timed out waiting for $description in the packaged app."
}

function Find-AppWindow([int]$processId, [string]$titlePattern) {
    $owner = [System.Windows.Automation.PropertyCondition]::new(
        [System.Windows.Automation.AutomationElement]::ProcessIdProperty, $processId
    )
    $windows = [System.Windows.Automation.AutomationElement]::RootElement.FindAll(
        [System.Windows.Automation.TreeScope]::Children, $owner
    )
    foreach ($window in $windows) {
        if ($window.Current.Name -like $titlePattern) { return $window }
    }
    return $null
}

function Find-Control($window, [string]$name) {
    $condition = [System.Windows.Automation.PropertyCondition]::new(
        [System.Windows.Automation.AutomationElement]::NameProperty, $name
    )
    return $window.FindFirst([System.Windows.Automation.TreeScope]::Descendants, $condition)
}

function Invoke-Control($element) {
    $pattern = $null
    if ($element.TryGetCurrentPattern([System.Windows.Automation.InvokePattern]::Pattern, [ref]$pattern)) {
        $pattern.Invoke()
    } elseif ($element.TryGetCurrentPattern([System.Windows.Automation.TogglePattern]::Pattern, [ref]$pattern)) {
        $pattern.Toggle()
    } else {
        throw "No supported UI Automation action on $($element.Current.Name)."
    }
}

function Save-PreviewDiagnostics($preview) {
    try {
        $entries = $preview.FindAll(
            [System.Windows.Automation.TreeScope]::Descendants,
            [System.Windows.Automation.Condition]::TrueCondition
        )
        Write-Host 'Presentation UI Automation descendants (type, name, off-screen):'
        foreach ($entry in $entries) {
            $info = $entry.Current
            if ($info.Name -and $info.Name -notmatch '^\d+$') {
                Write-Host ('  {0}, {1}, {2}' -f $info.ControlType.ProgrammaticName, $info.Name, $info.IsOffscreen)
            }
        }
    } catch {
        Write-Warning "Could not read Presentation accessibility diagnostics: $_"
    }

    try {
        Add-Type -AssemblyName System.Drawing
        $bounds = $preview.Current.BoundingRectangle
        $image = [Drawing.Bitmap]::new([int]$bounds.Width, [int]$bounds.Height)
        try {
            $graphics = [Drawing.Graphics]::FromImage($image)
            try {
                $graphics.CopyFromScreen([int]$bounds.X, [int]$bounds.Y, 0, 0, $image.Size)
                $results = Join-Path $root 'test-results'
                $null = New-Item -ItemType Directory -Path $results -Force
                $image.Save((Join-Path $results 'packaged-preview.png'), [Drawing.Imaging.ImageFormat]::Png)
            } finally {
                $graphics.Dispose()
            }
        } finally {
            $image.Dispose()
        }
    } catch {
        Write-Warning "Could not capture the Presentation window: $_"
    }
}

# UI Automation uses the production renderer's accessible names. Enable Chromium's UIA provider
# and accessibility tree while keeping the production fuses and normal storage path.
$accessibilityArgs = @('--enable-features=UiaProvider', '--force-renderer-accessibility=complete')
$process = Start-Process -FilePath $executable -WorkingDirectory $package -ArgumentList $accessibilityArgs -PassThru
try {
    $controller = Wait-ForElement $process 'the Controller window' { Find-AppWindow $process.Id 'Basic Bingo v*Controller' }
    $previewButton = Wait-ForElement $process 'the Preview button' { Find-Control $controller 'Preview' }
    Invoke-Control $previewButton

    $preview = Wait-ForElement $process 'the separate Presentation window' { Find-AppWindow $process.Id 'Basic Bingo *Presentation*' }
    $null = Wait-ForElement $process 'the empty Presentation board' { Find-Control $preview 'Ready for first call' }
    $ball = Wait-ForElement $process 'the uncalled B-3 button' { Find-Control $controller 'B-3, not called' }
    Invoke-Control $ball
    $null = Wait-ForElement $process 'B-3 as the current Controller call' { Find-Control $controller 'B-3, current call' }

    # Invoking a Controller button can activate its maximized window and cover Preview. Bring Preview
    # forward like an operator switching windows, so Chromium presents its visible accessibility tree.
    $desktop = New-Object -ComObject WScript.Shell
    if (-not $desktop.AppActivate($preview.Current.Name)) {
        Write-Warning 'Windows did not activate the Presentation Preview window.'
    }
    try {
        $null = Wait-ForElement $process 'B-3 in Presentation' {
            $livePreview = Find-AppWindow $process.Id 'Basic Bingo *Presentation*'
            if ($null -ne $livePreview) { Find-Control $livePreview 'B-3' }
        }
    } catch {
        Save-PreviewDiagnostics $preview
        throw
    }
    Write-Host 'The packaged Controller called B-3 and the separate Presentation showed it.'

    $close = $controller.GetCurrentPattern([System.Windows.Automation.WindowPattern]::Pattern)
    $close.Close()
    if (-not $process.WaitForExit(10000)) { throw 'Basic Bingo did not quit after closing the Controller.' }
    if ($process.ExitCode -ne 0) { throw "Basic Bingo exited with code $($process.ExitCode)." }
    $stateFile = Join-Path (Join-Path $profile 'bingo-data') 'state.json'
    $state = Get-Content -LiteralPath $stateFile -Raw | ConvertFrom-Json
    if (($state.game.calledNumbers -join ',') -ne '3') { throw 'The packaged app did not save the expected call.' }
    Write-Host 'The packaged app saved the call in the disposable Windows profile.'
} finally {
    if (-not $process.HasExited) { Stop-Process -Id $process.Id -Force }
    $process.Dispose()
}
