// vitest.config.ts aliases the "server-only" package to this empty module.
// The real package only enforces its check via Next's webpack build (it
// throws if bundled into client code) — outside that build there's nothing
// to import, so every "import 'server-only'" statement just needs
// something resolvable to no-op against under vitest.
export {};
