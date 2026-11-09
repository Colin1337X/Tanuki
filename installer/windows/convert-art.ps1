$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing
foreach ($name in @('wizard', 'mark')) {
    $source = Join-Path $PSScriptRoot ($name + '.png')
    $target = Join-Path $PSScriptRoot ($name + '.bmp')
    $bitmap = [System.Drawing.Bitmap]::FromFile($source)
    try { $bitmap.Save($target, [System.Drawing.Imaging.ImageFormat]::Bmp) }
    finally { $bitmap.Dispose() }
}
