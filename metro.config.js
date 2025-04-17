const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// Add any custom configurations here
module.exports = {
  ...config,
  resolver: {
    ...config.resolver,
    // Make sure the resolver can find your entry points
    sourceExts: ['js', 'jsx', 'ts', 'tsx', 'json'],
  },
};