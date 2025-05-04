// metro.config.js
const { getDefaultConfig } = require('@expo/metro-config');
const path = require('path');

// Create the default config
const defaultConfig = getDefaultConfig(__dirname);

// Extend the default config
module.exports = {
  ...defaultConfig,
  resolver: {
    ...defaultConfig.resolver,
    extraNodeModules: {
      // Your aliases
      '@screens': path.resolve(__dirname, 'screens'),
      '@services': path.resolve(__dirname, 'services'),
      '@components': path.resolve(__dirname, 'components'),
    },
    sourceExts: [...defaultConfig.resolver.sourceExts, 'mjs'],
  },
  transformer: {
    ...defaultConfig.transformer,
    minifierConfig: {
      keep_classnames: true,
      keep_fnames: true,
      mangle: {
        keep_classnames: true,
        keep_fnames: true,
      },
    },
  },
};