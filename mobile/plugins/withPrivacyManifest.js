// plugins/withPrivacyManifest.js
import ConfigPlugins from "@expo/config-plugins";
import path from "path";
import fs from "fs";

const { withDangerousMod } = ConfigPlugins;

// Apple requires a privacy manifest for apps that use location or third-party
// analytics SDKs (PostHog). This plugin writes PrivacyInfo.xcprivacy into the
// generated native iOS project during prebuild / EAS build.
//
// The three collected types below must stay in step with the App Privacy
// answers in App Store Connect. They disagreed once: the manifest declared
// location alone while the questionnaire described PostHog as well, and a
// binary that claims less than the listing is the mismatch Apple flags.
//
// NSPrivacyCollectedDataTypePreciseLocation: coords used for event proximity
//   and travel time. App functionality, not linked, not tracking.
// NSPrivacyCollectedDataTypeDeviceID: PostHog's anonymous device id. There is
//   no login and no identify() call anywhere in the app, so nothing ties it to
//   a person — that is what Linked=false is asserting.
// NSPrivacyCollectedDataTypeProductInteraction: the 15 analytics events in
//   src/services/analytics.ts (feed_loaded, surprise_me_tapped, and the rest).
//
// NSPrivacyTracking stays false: none of this is shared with a data broker or
// joined to third-party data, so no ATT prompt is required.
//
// NSPrivacyAccessedAPICategoryUserDefaults: AsyncStorage (and PostHog's device
//   ID persistence) read/write NSUserDefaults. Reason CA92.1 = "access info
//   from the same app that wrote it."
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
    <dict>
      <key>NSPrivacyCollectedDataType</key>
      <string>NSPrivacyCollectedDataTypeDeviceID</string>
      <key>NSPrivacyCollectedDataTypeLinked</key>
      <false/>
      <key>NSPrivacyCollectedDataTypeTracking</key>
      <false/>
      <key>NSPrivacyCollectedDataTypePurposes</key>
      <array>
        <string>NSPrivacyCollectedDataTypePurposeAnalytics</string>
      </array>
    </dict>
    <dict>
      <key>NSPrivacyCollectedDataType</key>
      <string>NSPrivacyCollectedDataTypeProductInteraction</string>
      <key>NSPrivacyCollectedDataTypeLinked</key>
      <false/>
      <key>NSPrivacyCollectedDataTypeTracking</key>
      <false/>
      <key>NSPrivacyCollectedDataTypePurposes</key>
      <array>
        <string>NSPrivacyCollectedDataTypePurposeAnalytics</string>
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

export default function withPrivacyManifest(config) {
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
