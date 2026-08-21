module.exports = function (api) {
  api.cache(true);
  return {
    presets: ['babel-preset-expo'],
    // react-native-worklets/plugin (react-native-reanimated 4's worklet
    // transform, split out of the reanimated package itself) must be the
    // last plugin in this array per its own docs — anything after it
    // wouldn't see already-transformed worklet code.
    plugins: ['react-native-worklets/plugin'],
  };
};
