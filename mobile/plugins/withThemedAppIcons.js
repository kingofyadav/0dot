const { withAndroidManifest, withDangerousMod, AndroidConfig } = require("@expo/config-plugins");
const { generateImageAsync } = require("@expo/image-utils");
const fs = require("fs");
const path = require("path");

// Android themed launcher icon.
//
// Android has no built-in per-appearance app icon, so this wires up a
// single "light" alternate that src/utils/useThemedAppIcon activates in
// light mode (dark mode falls back to the default icon in
// app.json > android.adaptiveIcon, which is already dark). The native
// swap itself is done by expo-dynamic-app-icon's autolinked module —
// this plugin only builds the resources it points `android:icon` at.
//
// The alternate is a real adaptive icon that reuses the default icon's
// own foreground + monochrome layers and only swaps the background
// colour, so it sits inside the launcher's circular / squircle mask
// exactly like the default icon (no clipped edges), plus a flat mipmap
// fallback for API 24–25 which predates adaptive icons.
//
// props: { name, background, foregroundSrc } — `name` is the icon /
// activity-alias suffix (must match the string passed to setAppIcon),
// `background` the adaptive background colour, `foregroundSrc` the source
// art for the flat fallback (a transparent-background foreground with its
// own safe-zone padding).

const FLAT_DENSITIES = [
  ["mdpi", 48],
  ["hdpi", 72],
  ["xhdpi", 96],
  ["xxhdpi", 144],
  ["xxxhdpi", 192],
];

module.exports = function withThemedAppIcons(config, props = {}) {
  const name = props.name || "light";
  const background = props.background || "#FFFFFF";
  const foregroundSrc = props.foregroundSrc || "./assets/android-icon-foreground.png";
  const colorRes = `ic_launcher_background_${name}`;

  // 1. activity-alias so the launcher has something to switch to.
  config = withAndroidManifest(config, (cfg) => {
    const app = AndroidConfig.Manifest.getMainApplicationOrThrow(cfg.modResults);
    const aliasName = `${cfg.android.package}.MainActivity${name}`;
    app["activity-alias"] = (app["activity-alias"] || []).filter(
      (a) => a.$["android:name"] !== aliasName
    );
    app["activity-alias"].push({
      $: {
        "android:name": aliasName,
        "android:enabled": "false",
        "android:exported": "true",
        "android:icon": `@mipmap/${name}`,
        "android:roundIcon": `@mipmap/${name}_round`,
        "android:targetActivity": ".MainActivity",
      },
      "intent-filter": [
        {
          action: [{ $: { "android:name": "android.intent.action.MAIN" } }],
          category: [{ $: { "android:name": "android.intent.category.LAUNCHER" } }],
        },
      ],
    });
    return cfg;
  });

  // 2. the icon resources.
  config = withDangerousMod(config, [
    "android",
    async (cfg) => {
      const projectRoot = cfg.modRequest.projectRoot;
      const resPath = path.join(cfg.modRequest.platformProjectRoot, "app", "src", "main", "res");

      // 2a. adaptive icon XML (API 26+), reusing the default layers.
      const adaptiveXml = `<?xml version="1.0" encoding="utf-8"?>
<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">
    <background android:drawable="@color/${colorRes}"/>
    <foreground android:drawable="@mipmap/ic_launcher_foreground"/>
    <monochrome android:drawable="@mipmap/ic_launcher_monochrome"/>
</adaptive-icon>
`;
      const anydpiDir = path.join(resPath, "mipmap-anydpi-v26");
      fs.mkdirSync(anydpiDir, { recursive: true });
      fs.writeFileSync(path.join(anydpiDir, `${name}.xml`), adaptiveXml);
      fs.writeFileSync(path.join(anydpiDir, `${name}_round.xml`), adaptiveXml);

      // 2b. background colour.
      const colorsPath = path.join(resPath, "values", "colors.xml");
      let colors = fs.readFileSync(colorsPath, "utf8");
      if (!colors.includes(`name="${colorRes}"`)) {
        colors = colors.replace("</resources>", `  <color name="${colorRes}">${background}</color>\n</resources>`);
        fs.writeFileSync(colorsPath, colors);
      }

      // 2c. flat mipmap fallback (API 24–25) — foreground flattened onto
      //     the background colour at each density.
      for (const [density, size] of FLAT_DENSITIES) {
        const { source } = await generateImageAsync(
          { projectRoot, cacheType: `themed-app-icon-${name}-${size}` },
          {
            name: `${name}.png`,
            src: foregroundSrc,
            removeTransparency: true,
            backgroundColor: background,
            resizeMode: "contain",
            width: size,
            height: size,
          }
        );
        const outDir = path.join(resPath, `mipmap-${density}`);
        fs.mkdirSync(outDir, { recursive: true });
        fs.writeFileSync(path.join(outDir, `${name}.png`), source);
        fs.writeFileSync(path.join(outDir, `${name}_round.png`), source);
      }

      return cfg;
    },
  ]);

  return config;
};
