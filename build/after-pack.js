// electron-builder afterPack hook.
//
// Without an Apple Developer ID, electron-builder leaves the app unsigned.
// Apple Silicon refuses to launch unsigned binaries, so we apply an ad-hoc
// signature (identity "-") with our entitlements. When a real identity is
// configured, electron-builder signs the app right after this hook and
// simply overwrites the ad-hoc signature.
const { execFileSync } = require('node:child_process');
const path = require('node:path');

exports.default = async function afterPack(context) {
  if (context.electronPlatformName !== 'darwin') return;
  const appPath = path.join(context.appOutDir, `${context.packager.appInfo.productFilename}.app`);
  const entitlements = path.join(__dirname, 'entitlements.mac.plist');
  const hasIdentity = Boolean(process.env.CSC_LINK || process.env.CSC_NAME || process.env.CSC_KEY_PASSWORD);
  if (hasIdentity) return;
  console.log('  • no Developer ID configured: applying ad-hoc code signature so macOS will launch the app');
  execFileSync(
    'codesign',
    ['--force', '--deep', '--sign', '-', '--options', 'runtime', '--entitlements', entitlements, appPath],
    { stdio: 'inherit' },
  );
};
