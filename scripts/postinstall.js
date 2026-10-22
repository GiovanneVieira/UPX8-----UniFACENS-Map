const fs = require('fs');
const path = require('path');

function createSymlink(target, linkPath) {
  if (!fs.existsSync(linkPath)) {
    try {
      const parentDir = path.dirname(linkPath);
      if (!fs.existsSync(parentDir)) {
        fs.mkdirSync(parentDir, { recursive: true });
      }
      fs.symlinkSync(target, linkPath, 'junction');
    } catch (e) {
      // Ignora se não for possível criar symlink ou se já existir
    }
  }
}

createSymlink('../unifacens-client/node_modules/expo-router', 'node_modules/expo-router');
createSymlink('../../unifacens-client/node_modules/@expo/metro-runtime', 'node_modules/@expo/metro-runtime');
