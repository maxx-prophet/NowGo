import "dotenv/config";

export default ({ config }) => ({
  ...config,
  name: "NowGo",
  slug: "nowgo",
  version: "1.0.0",
  orientation: "portrait",
  icon: "./assets/icon.png",
  userInterfaceStyle: "dark",
  newArchEnabled: true,
  splash: {
    image: "./assets/splash-icon.png",
    resizeMode: "contain",
    backgroundColor: "#0A0A0A",
  },
  ios: {
    supportsTablet: false,
    bundleIdentifier: "com.nowgo.app",
  },
  android: {
    adaptiveIcon: {
      foregroundImage: "./assets/adaptive-icon.png",
      backgroundColor: "#0A0A0A",
    },
    edgeToEdgeEnabled: true,
  },
  web: {
    favicon: "./assets/favicon.png",
  },
  extra: {
    apiUrl: process.env.API_URL ?? "https://nowgo-production.up.railway.app",
    appEnv: process.env.APP_ENV ?? "production",
    eas: {
      projectId: "9776acca-9db0-4dab-a3e3-1d2eb6192538",
    },
  },
});
