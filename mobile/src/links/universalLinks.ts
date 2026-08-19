import * as Linking from "expo-linking";

// spec §5.3: every existing public URL namespace (@username, /c/, /b/,
// /p/, /e/) resolves into the app via iOS Universal Links / Android App
// Links — app.json's associatedDomains ("applinks:0dot.in") and
// intentFilters (https://0dot.in) are the platform-registration half of
// that; this is the runtime half that receives the parsed URL once the OS
// hands it to the app. There's no router/screen set to navigate into yet
// (this app is still the build plan's step-by-step smoke test, not a full
// app) — onUrl just receives the parsed path so a caller can prove the
// link arrived, same "prove it, don't just wire it" pattern as steps 3–5.
//
// Note: the *https* path only actually verifies once real TEAMID /
// signing-cert values replace apple-app-site-association's and
// assetlinks.json's placeholders (build plan's "recommendation before
// scaffolding" note) — until then, only the custom-scheme redirect
// (0dot-ios://, 0dot-android://) used by the OAuth flow is live. This
// listener is agnostic to which scheme fired it.
export function subscribeToIncomingLinks(onUrl: (url: string) => void): () => void {
  Linking.getInitialURL()
    .then((url) => {
      if (url) onUrl(url);
    })
    .catch(() => {});

  const subscription = Linking.addEventListener("url", (event) => onUrl(event.url));
  return () => subscription.remove();
}
