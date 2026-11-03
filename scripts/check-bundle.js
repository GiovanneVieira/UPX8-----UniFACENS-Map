const http = require('http');

http.get('http://127.0.0.1:8081/node_modules/expo-router/entry.bundle?platform=android&dev=true', (res) => {
  let d = '';
  res.on('data', c => d += c);
  res.on('end', () => {
    const searchStr = 'CampusMap';
    const idx = d.indexOf(searchStr);
    console.log('Index of "CampusMap":', idx);
    const searchStr2 = 'places-feature';
    console.log('Index of "places-feature":', d.indexOf(searchStr2));
    const searchStr3 = 'usePlacesQuery';
    console.log('Index of "usePlacesQuery":', d.indexOf(searchStr3));
    const searchStr4 = 'ViroARAnchorContainer';
    console.log('Index of "ViroARAnchorContainer":', d.indexOf(searchStr4));
  });
});
