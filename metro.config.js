const { getDefaultConfig } = require('@expo/metro-config');
const path = require('path');

const config = getDefaultConfig(__dirname);

// Add any additional configuration
config.resolver.extraNodeModules = {
  // You can add aliases here if needed
  '@screens': path.resolve(__dirname, 'screens'),
  '@services': path.resolve(__dirname, 'services'),
  '@components': path.resolve(__dirname, 'components'),
};

// Adjust the sourcemap configuration
config.transformer.minifierConfig = {
  keep_classnames: true,
  keep_fnames: true,
  mangle: {
    keep_classnames: true,
    keep_fnames: true,
  },
};

// Add any additional file extensions
config.resolver.sourceExts = [...config.resolver.sourceExts, 'mjs'];

module.exports = config;