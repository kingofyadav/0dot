// Metro resolves image imports to a numeric asset id (registered via
// AssetRegistry) rather than a URL string — this typing matches what
// `Image`'s `source` prop already expects, so `import x from "./x.png"`
// works as a drop-in replacement for `require("./x.png")`.
declare module "*.png" {
  const source: number;
  export default source;
}

declare module "*.jpg" {
  const source: number;
  export default source;
}
