const { execFile } = require('node:child_process');
let pendingFonts;
function installedFonts() {
  if (pendingFonts) return pendingFonts;
  pendingFonts = new Promise((resolve, reject) => {
    const script = '[Console]::OutputEncoding = [System.Text.Encoding]::UTF8; Add-Type -AssemblyName System.Drawing; $fonts = New-Object System.Drawing.Text.InstalledFontCollection; try { ConvertTo-Json -Compress -InputObject @($fonts.Families | ForEach-Object { $_.Name } | Sort-Object -Unique) } finally { $fonts.Dispose() }';
    execFile('powershell.exe', ['-NoLogo', '-NoProfile', '-NonInteractive', '-Command', script],
      { windowsHide: true, timeout: 15000, maxBuffer: 1024 * 1024, encoding: 'utf8' }, (error, stdout) => {
        if (error) { pendingFonts = undefined; reject(new Error('설치된 글꼴 목록을 읽지 못했습니다.')); return; }
        try {
          const fonts = JSON.parse(stdout.replace(/^\uFEFF/, '').trim());
          if (!Array.isArray(fonts)) throw new Error('fonts');
          resolve(fonts.filter(font => typeof font === 'string' && font.length <= 200));
        } catch { pendingFonts = undefined; reject(new Error('글꼴 목록을 읽지 못했습니다.')); }
      });
  });
  return pendingFonts;
}
module.exports = { installedFonts };
