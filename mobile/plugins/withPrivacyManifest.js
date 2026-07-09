// plugins/withPrivacyManifest.js
const { withDangerousMod } = require("@expo/config-plugins");
const path = require("path");
const fs = require("fs");

// Apple requires a privacy manifest for apps that use location or third-party
// analytics SDKs (PostHog). This plugin writes PrivacyInfo.xcprivacy into the
// generated native iOS project during prebuild / EAS build.
//
// NSPrivacyAccessedAPICategoryUserDefaults: AsyncStorage (and PostHog's device
//   ID persistence) read/write NSUserDefaults. Reason CA92.1 = "access info
//   from the same app that wrote it."
// NSPrivacyCollectedDataTypePreciseLocation: location coords used for event
//   proximity and travel time — not linked to identity, not for tracking.
//
// Verify reason codes against https://developer.apple.com/documentation/bundleresources/privacy-manifest-files
// before submitting — Apple occasionally adds new required reasons.
const PRIVACY_MANIFEST = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>NSPrivacyTracking</key>
  <false/>
  <key>NSPrivacyCollectedDataTypes</key>
  <array>
    <dict>
      <key>NSPrivacyCollectedDataType</key>
      <string>NSPrivacyCollectedDataTypePreciseLocation</string>
      <key>NSPrivacyCollectedDataTypeLinked</key>
      <false/>
      <key>NSPrivacyCollectedDataTypeTracking</key>
      <false/>
      <key>NSPrivacyCollectedDataTypePurposes</key>
      <array>
        <string>NSPrivacyCollectedDataTypePurposeAppFunctionality</string>
      </array>
    </dict>
  </array>
  <key>NSPrivacyAccessedAPITypes</key>
  <array>
    <dict>
      <key>NSPrivacyAccessedAPIType</key>
      <string>NSPrivacyAccessedAPICategoryUserDefaults</string>
      <key>NSPrivacyAccessedAPITypeReasons</key>
      <array>
        <string>CA92.1</string>
      </array>
    </dict>
  </array>
</dict>
</plist>`;

module.exports = function withPrivacyManifest(config) {
  return withDangerousMod(config, [
    "ios",
    (config) => {
      const projectRoot = config.modRequest.projectRoot;
      const projectName = config.modRequest.projectName;
      const iosDir = path.join(projectRoot, "ios", projectName);
      fs.mkdirSync(iosDir, { recursive: true });
      fs.writeFileSync(path.join(iosDir, "PrivacyInfo.xcprivacy"), PRIVACY_MANIFEST);
      return config;
    },
  ]);
};
