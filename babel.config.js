module.exports = function(api) {
  api.cache(true);
  return {
    presets: ['babel-preset-expo'],
    plugins: [
      // Add module resolver to handle import paths
      [
        'module-resolver',
        {
          root: ['./'],
          extensions: ['.ios.js', '.android.js', '.js', '.jsx', '.ts', '.tsx', '.json'],
          alias: {
            // You can add aliases here if needed
            '@screens': './screens',
            '@services': './services',
            '@components': './components',
          },
        },
      ],
  '@babel/plugin-transform-export-namespace-from',
  'react-native-reanimated/plugin',    ],
  };
};