const { getDefaultConfig } = require('@expo/metro-config');
const path = require('path');

const config = getDefaultConfig(__dirname);

// Add your customizations
config.resolver.extraNodeModules = {
  ...config.resolver.extraNodeModules,
  '@screens': path.resolve(__dirname, 'screens'),
  '@services': path.resolve(__dirname, 'services'),
  '@components': path.resolve(__dirname, 'components'),
};

config.resolver.sourceExts = [
  ...config.resolver.sourceExts,
  'mjs',
];

config.transformer.minifierConfig = {
  keep_classnames: true,
  keep_fnames: true,
  mangle: {
    keep_classnames: true,
    keep_fnames: true,
  },
};

module.exports = config;
