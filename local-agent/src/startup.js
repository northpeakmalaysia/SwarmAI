/**
 * Cross-OS auto-start at boot management
 * Supports Windows (Registry), macOS (LaunchAgent), Linux (systemd user service)
 */

const os = require('os');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const APP_NAME = 'swarmai-agent';
const APP_LABEL = 'com.swarmai.agent';

/**
 * Get the full path to the swarmai-agent executable
 */
function getExecutablePath() {
  const platform = os.platform();
  try {
    if (platform === 'win32') {
      return execSync('where swarmai-agent', { encoding: 'utf-8' }).trim().split('\n')[0].trim();
    } else {
      return execSync('which swarmai-agent', { encoding: 'utf-8' }).trim();
    }
  } catch {
    // Fallback: use the current process
    return process.argv[1] || 'swarmai-agent';
  }
}

/**
 * Enable auto-start at boot
 */
function enableStartup() {
  const platform = os.platform();
  const execPath = getExecutablePath();

  switch (platform) {
    case 'win32':
      return enableWindows(execPath);
    case 'darwin':
      return enableMacOS(execPath);
    case 'linux':
      return enableLinux(execPath);
    default:
      throw new Error(`Unsupported platform: ${platform}. Supported: Windows, macOS, Linux`);
  }
}

/**
 * Disable auto-start at boot
 */
function disableStartup() {
  const platform = os.platform();

  switch (platform) {
    case 'win32':
      return disableWindows();
    case 'darwin':
      return disableMacOS();
    case 'linux':
      return disableLinux();
    default:
      throw new Error(`Unsupported platform: ${platform}`);
  }
}

/**
 * Check if auto-start is enabled
 */
function isStartupEnabled() {
  const platform = os.platform();

  switch (platform) {
    case 'win32':
      return isEnabledWindows();
    case 'darwin':
      return isEnabledMacOS();
    case 'linux':
      return isEnabledLinux();
    default:
      return false;
  }
}

// ================
// Windows: Registry
// ================

function enableWindows(execPath) {
  // Sanitize execPath to prevent command injection via quotes in path
  const safePath = execPath.replace(/"/g, '');
  const cmd = `"${safePath}" start`;
  try {
    execSync(
      `reg add "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run" /v "${APP_NAME}" /t REG_SZ /d "${cmd}" /f`,
      { encoding: 'utf-8', stdio: 'pipe' }
    );
    return { method: 'registry', path: 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run' };
  } catch (err) {
    throw new Error(`Failed to set Windows registry: ${err.message}`);
  }
}

function disableWindows() {
  try {
    execSync(
      `reg delete "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run" /v "${APP_NAME}" /f`,
      { encoding: 'utf-8', stdio: 'pipe' }
    );
    return true;
  } catch {
    return false; // Already removed
  }
}

function isEnabledWindows() {
  try {
    const output = execSync(
      `reg query "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run" /v "${APP_NAME}"`,
      { encoding: 'utf-8', stdio: 'pipe' }
    );
    return output.includes(APP_NAME);
  } catch {
    return false;
  }
}

// ================
// macOS: LaunchAgent
// ================

function getLaunchAgentPath() {
  return path.join(os.homedir(), 'Library', 'LaunchAgents', `${APP_LABEL}.plist`);
}

function enableMacOS(execPath) {
  const plistPath = getLaunchAgentPath();
  const plistDir = path.dirname(plistPath);

  if (!fs.existsSync(plistDir)) {
    fs.mkdirSync(plistDir, { recursive: true });
  }

  const plist = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>${APP_LABEL}</string>
  <key>ProgramArguments</key>
  <array>
    <string>${execPath}</string>
    <string>start</string>
  </array>
  <key>RunAtLoad</key>
  <true/>
  <key>KeepAlive</key>
  <true/>
  <key>StandardOutPath</key>
  <string>${path.join(os.homedir(), '.swarmai', 'agent.log')}</string>
  <key>StandardErrorPath</key>
  <string>${path.join(os.homedir(), '.swarmai', 'agent-error.log')}</string>
</dict>
</plist>`;

  fs.writeFileSync(plistPath, plist, 'utf-8');

  try {
    execSync(`launchctl load "${plistPath}"`, { stdio: 'pipe' });
  } catch {
    // May already be loaded
  }

  return { method: 'launchagent', path: plistPath };
}

function disableMacOS() {
  const plistPath = getLaunchAgentPath();

  try {
    execSync(`launchctl unload "${plistPath}"`, { stdio: 'pipe' });
  } catch {
    // May not be loaded
  }

  if (fs.existsSync(plistPath)) {
    fs.unlinkSync(plistPath);
    return true;
  }
  return false;
}

function isEnabledMacOS() {
  return fs.existsSync(getLaunchAgentPath());
}

// ================
// Linux: systemd user service
// ================

function getSystemdServicePath() {
  return path.join(os.homedir(), '.config', 'systemd', 'user', `${APP_NAME}.service`);
}

function enableLinux(execPath) {
  const servicePath = getSystemdServicePath();
  const serviceDir = path.dirname(servicePath);

  if (!fs.existsSync(serviceDir)) {
    fs.mkdirSync(serviceDir, { recursive: true });
  }

  const service = `[Unit]
Description=SwarmAI Local Agent
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
ExecStart=${execPath} start
Restart=on-failure
RestartSec=10
Environment=HOME=${os.homedir()}

[Install]
WantedBy=default.target
`;

  fs.writeFileSync(servicePath, service, 'utf-8');

  try {
    execSync('systemctl --user daemon-reload', { stdio: 'pipe' });
    execSync(`systemctl --user enable ${APP_NAME}.service`, { stdio: 'pipe' });
    return { method: 'systemd', path: servicePath };
  } catch (err) {
    // systemd might not be available, try XDG autostart fallback
    return enableLinuxXdg(execPath);
  }
}

function enableLinuxXdg(execPath) {
  const autostartDir = path.join(os.homedir(), '.config', 'autostart');
  const desktopPath = path.join(autostartDir, `${APP_NAME}.desktop`);

  if (!fs.existsSync(autostartDir)) {
    fs.mkdirSync(autostartDir, { recursive: true });
  }

  const desktop = `[Desktop Entry]
Type=Application
Name=SwarmAI Local Agent
Exec=${execPath} start
Hidden=false
NoDisplay=true
X-GNOME-Autostart-enabled=true
`;

  fs.writeFileSync(desktopPath, desktop, 'utf-8');
  return { method: 'xdg-autostart', path: desktopPath };
}

function disableLinux() {
  // Try systemd first
  const servicePath = getSystemdServicePath();
  if (fs.existsSync(servicePath)) {
    try {
      execSync(`systemctl --user disable ${APP_NAME}.service`, { stdio: 'pipe' });
      execSync('systemctl --user daemon-reload', { stdio: 'pipe' });
    } catch {
      // systemd might not be available
    }
    fs.unlinkSync(servicePath);
    return true;
  }

  // Try XDG autostart
  const desktopPath = path.join(os.homedir(), '.config', 'autostart', `${APP_NAME}.desktop`);
  if (fs.existsSync(desktopPath)) {
    fs.unlinkSync(desktopPath);
    return true;
  }

  return false;
}

function isEnabledLinux() {
  if (fs.existsSync(getSystemdServicePath())) return true;
  if (fs.existsSync(path.join(os.homedir(), '.config', 'autostart', `${APP_NAME}.desktop`))) return true;
  return false;
}

module.exports = {
  enableStartup,
  disableStartup,
  isStartupEnabled,
};
