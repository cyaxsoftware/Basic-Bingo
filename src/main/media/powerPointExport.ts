import { execFile } from 'node:child_process';
import path from 'node:path';
import { promisify } from 'node:util';

export interface PowerPointExport {
  readonly count: number;
  readonly width: number;
  readonly height: number;
}

// Paths are data in the child environment, never part of the PowerShell source.
const EXPORT_SCRIPT = String.raw`
$ErrorActionPreference = 'Stop'
$source = $env:BINGO_PPTX_SOURCE
$output = $env:BINGO_PPTX_OUTPUT

function Test-OfflineDeck($file) {
  Add-Type -AssemblyName System.IO.Compression.FileSystem
  $archive = [IO.Compression.ZipFile]::OpenRead($file)
  try {
    if ($null -eq $archive.GetEntry('ppt/presentation.xml')) { throw 'Missing PowerPoint presentation part.' }
    $settings = [Xml.XmlReaderSettings]::new()
    $settings.DtdProcessing = [Xml.DtdProcessing]::Prohibit
    $settings.XmlResolver = $null
    $settings.MaxCharactersInDocument = 1048576
    $settings.CloseInput = $true
    foreach ($entry in $archive.Entries) {
      if (!$entry.FullName.EndsWith('.rels', [StringComparison]::OrdinalIgnoreCase)) { continue }
      $stream = $entry.Open()
      try {
        $reader = [Xml.XmlReader]::Create($stream, $settings)
        try {
          while ($reader.Read()) {
            if ($reader.NodeType -eq [Xml.XmlNodeType]::Element -and $reader.LocalName -eq 'Relationship' -and
                $reader.GetAttribute('TargetMode') -eq 'External' -and $reader.GetAttribute('Type') -notmatch '/hyperlink$') {
              return $false
            }
          }
        } finally { $reader.Dispose() }
      } finally { $stream.Dispose() }
    }
    return $true
  } finally { $archive.Dispose() }
}

try {
  $drive = [IO.Path]::GetPathRoot($source)
  if ($drive -notmatch '^[A-Za-z]:\\$' -or [IO.DriveInfo]::new($drive).DriveType -eq [IO.DriveType]::Network) { exit 15 }
  # A working copy protects the original even when it is already open in PowerPoint.
  $deck = Join-Path $output 'source.pptx'
  [IO.File]::Copy($source, $deck)
  if (!(Test-OfflineDeck $deck)) { exit 12 }
} catch {
  [Console]::Error.WriteLine($_.Exception.Message)
  exit 11
}

$powerPointWasOpen = $null -ne (Get-Process -Name POWERPNT -ErrorAction SilentlyContinue)
try {
  $powerPoint = New-Object -ComObject PowerPoint.Application
} catch {
  [Console]::Error.WriteLine($_.Exception.Message)
  exit 10
}

$presentation = $null
try {
  $security = $powerPoint.AutomationSecurity
  try {
    # msoAutomationSecurityForceDisable; msoTrue for ReadOnly and msoFalse for WithWindow.
    $powerPoint.AutomationSecurity = 3
    $presentation = $powerPoint.Presentations.Open($deck, -1, 0, 0)
  } finally { $powerPoint.AutomationSecurity = $security }

  $count = $presentation.Slides.Count
  if ($count -lt 1) { exit 13 }
  $slideWidth = [double]$presentation.PageSetup.SlideWidth
  $slideHeight = [double]$presentation.PageSetup.SlideHeight
  $scale = 1920 / [Math]::Max($slideWidth, $slideHeight)
  $width = [Math]::Max(1, [int][Math]::Round($slideWidth * $scale))
  $height = [Math]::Max(1, [int][Math]::Round($slideHeight * $scale))
  for ($i = 1; $i -le $count; $i++) {
    $file = Join-Path $output ('slide-{0}.png' -f $i)
    $presentation.Slides.Item($i).Export($file, 'PNG', $width, $height)
  }
  [Console]::WriteLine("$count,$width,$height")
} catch {
  [Console]::Error.WriteLine($_.Exception.Message)
  exit 14
} finally {
  if ($null -ne $presentation) {
    try { $presentation.Close() } catch { [Console]::Error.WriteLine($_.Exception.Message) }
  }
  if (!$powerPointWasOpen) {
    try {
      if ($powerPoint.Presentations.Count -eq 0) { $powerPoint.Quit() }
    } catch { [Console]::Error.WriteLine($_.Exception.Message) }
  }
}
`;

const run = promisify(execFile);
const timeoutMs = 180_000;

function exportFailed(error: unknown): Error {
  if (error instanceof Error && 'code' in error) {
    switch (error.code) {
      case 10:
        return new Error(
          'Could not start Microsoft PowerPoint. Install desktop PowerPoint and open it once before importing.',
        );
      case 11:
        return new Error(
          'Could not read this presentation. Save an unlocked .pptx file in PowerPoint and try again.',
        );
      case 12:
        return new Error(
          'This presentation contains linked content. Embed the linked files in PowerPoint before importing.',
        );
      case 13:
        return new Error('This presentation has no slides to import.');
      case 15:
        return new Error('Choose a PowerPoint file from a local drive or USB drive.');
      case 'ENOENT':
        return new Error('PowerPoint import requires Windows PowerShell and desktop Microsoft PowerPoint.');
    }
  }
  if (error instanceof Error && 'killed' in error && error.killed) {
    return new Error('PowerPoint did not finish in time. Check for an open PowerPoint prompt and try again.');
  }
  return new Error(
    'PowerPoint could not export the presentation. Open it in PowerPoint and check that all slides display.',
  );
}

export async function exportPowerPoint(source: string, directory: string): Promise<PowerPointExport> {
  if (process.platform !== 'win32')
    throw new Error('PowerPoint import requires Windows with desktop Microsoft PowerPoint.');
  const encoded = Buffer.from(EXPORT_SCRIPT, 'utf16le').toString('base64');
  // An absolute executable path avoids loading a script or program with the same name from the workspace.
  const powerShell = path.join(
    process.env['SystemRoot'] ?? 'C:\\Windows',
    'System32',
    'WindowsPowerShell',
    'v1.0',
    'powershell.exe',
  );
  let stdout: string;
  try {
    ({ stdout } = await run(
      powerShell,
      ['-NoProfile', '-NonInteractive', '-STA', '-EncodedCommand', encoded],
      {
        windowsHide: true,
        timeout: timeoutMs,
        env: { ...process.env, BINGO_PPTX_SOURCE: source, BINGO_PPTX_OUTPUT: directory },
      },
    ));
  } catch (error) {
    throw exportFailed(error);
  }

  const [count, width, height] = stdout.trim().split(',').map(Number);
  if (
    !count ||
    !width ||
    !height ||
    ![count, width, height].every(Number.isSafeInteger) ||
    count < 1 ||
    width < 1 ||
    height < 1 ||
    Math.max(width, height) !== 1920
  ) {
    throw new Error('PowerPoint returned an incomplete slide export.');
  }
  return { count, width, height };
}
