import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appName: "تنظيم المضخات",
  appId: "com.pumpmanagement.app",
  webDir: "dist",
  android: {
    allowMixedContent: false,
  },
  server: {
    androidScheme: "https",
  },
};

export default config;
