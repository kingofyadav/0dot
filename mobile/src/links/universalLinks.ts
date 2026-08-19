import * as Linking from "expo-linking";
import { resolvePath } from "./resolvePath";

// spec §5.3: every existing public URL namespace (@username, /c/, /b/,
// /p/, /e/) resolves into the app via iOS Universal Links / Android App
// Links — app.json's associatedDomains ("applinks:0dot.in") and
// intentFilters (https://0dot.in) are the platform-registration half of
// that; this is the runtime half that receives the parsed URL once the OS
// hands it to the app, and now actually navigates via resolvePath instead
// of just proving arrival (this app's original smoke-test posture).
//
// Note: the *https* path only actually verifies once real TEAMID /
// signing-cert values replace apple-app-site-association's and
// assetlinks.json's placeholders (build plan's "recommendation before
// scaffolding" note) — until then, only the custom-scheme redirect
// (zerodot-ios://, zerodot-android://) used by the OAuth flow is live.
export function subscribeToIncomingLinks(): () => void {
  const handle = (url: string) => {
    const { hostname, path } = Linking.parse(url);
    // The OAuth redirect (zerodot-ios://oauth/callback) also fires this
    // listener on some platforms even though expo-auth-session's own
    // promptAsync already resolves the sign-in flow directly — resolvePath
    // has no post/profile screen for "oauth", so this would otherwise fall
    // through to its browser-fallback and pop a nonsense URL open.
    if (hostname === "oauth" || path?.startsWith("oauth")) return;
    if (path) resolvePath(`/${path}`);
  };

  Linking.getInitialURL()
    .then((url) => {
      if (url) handle(url);
    })
    .catch(() => {});

  const subscription = Linking.addEventListener("url", (event) => handle(event.url));
  return () => subscription.remove();
}
