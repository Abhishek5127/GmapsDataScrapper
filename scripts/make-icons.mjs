// Generates Chrome extension icon sizes from public/icons/app-icon-source.png.
// Run with: npm run icons
import { mkdirSync, existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = resolve(__dirname, '../public/icons');
const SOURCE = resolve(OUT_DIR, 'app-icon-source.png');

mkdirSync(OUT_DIR, { recursive: true });

if (!existsSync(SOURCE)) {
  throw new Error(`Missing source icon: ${SOURCE}`);
}

const ps = `
Add-Type -AssemblyName System.Drawing
$source = [System.Drawing.Image]::FromFile('${SOURCE.replace(/'/g, "''")}')
$side = [Math]::Min($source.Width, $source.Height)
$sx = [Math]::Floor(($source.Width - $side) / 2)
$sy = [Math]::Floor(($source.Height - $side) / 2)
$srcRect = New-Object System.Drawing.Rectangle($sx, $sy, $side, $side)
foreach ($size in @(16, 32, 48, 128)) {
  $bitmap = New-Object System.Drawing.Bitmap($size, $size)
  $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
  $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
  $graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
  $graphics.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
  $graphics.Clear([System.Drawing.Color]::Transparent)
  $destRect = New-Object System.Drawing.Rectangle(0, 0, $size, $size)
  $graphics.DrawImage($source, $destRect, $srcRect, [System.Drawing.GraphicsUnit]::Pixel)
  $bitmap.Save((Join-Path '${OUT_DIR.replace(/'/g, "''")}' "icon$size.png"), [System.Drawing.Imaging.ImageFormat]::Png)
  $graphics.Dispose()
  $bitmap.Dispose()
  Write-Host "wrote icon$size.png"
}
$source.Dispose()
`;

execFileSync('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', ps], {
  stdio: 'inherit',
});
