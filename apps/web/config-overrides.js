const path = require('path');

module.exports = function override(config) {
  // Remove ALL resolve plugins to bypass ModuleScopePlugin
  // This is safe for dev — it just allows imports from outside src/
  config.resolve.plugins = [];

  // Alias react-native to react-native-web for web builds
  config.resolve.alias = {
    ...config.resolve.alias,
    'react-native$': 'react-native-web',
  };

  return config;
};
