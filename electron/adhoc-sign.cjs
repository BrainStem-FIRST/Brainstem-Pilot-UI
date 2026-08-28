// macOS will not launch an app whose signature does not match its contents — it reports it as
// "damaged and can't be opened", which reads like a corrupt download but is a signing failure.
//
// Electron's prebuilt binary arrives linker-signed ad-hoc under the identifier "Electron".
// electron-builder then renames the bundle, rewrites Info.plist and adds resources, all of
// which invalidate that signature. With no certificate available in CI it skips re-signing,
// so what ships is a bundle carrying a signature for different contents. On Apple Silicon,
// where every binary must be signed, that is fatal.
//
// Ad-hoc signing here restores a signature that matches what we actually built. It is not a
// Developer ID signature and it is not notarised, so first launch still needs the quarantine
// flag cleared — but the app runs.

const { execFileSync } = require('node:child_process');
const path = require('node:path');

exports.default = async function adhocSign(context) {
  if (context.electronPlatformName !== 'darwin') return;

  const appPath = path.join(
    context.appOutDir,
    `${context.packager.appInfo.productFilename}.app`,
  );

  // --deep is discouraged for real distribution signing, but it is the right tool for a
  // bundle-wide ad-hoc pass: every nested helper and framework needs re-signing too.
  execFileSync('codesign', ['--force', '--deep', '--sign', '-', appPath], {
    stdio: 'inherit',
  });

  // Fail the build rather than ship another bundle that cannot launch.
  execFileSync('codesign', ['--verify', '--deep', '--strict', appPath], {
    stdio: 'inherit',
  });

  console.log(`  • ad-hoc signed  ${path.basename(appPath)}`);
};
