const path = require('path');

const rootPath = process.cwd();
const context = path.join(rootPath, 'src');
const outputPath = path.join(rootPath, 'dist');

module.exports = {
  mode: 'development',
  context,
  entry: {
    DIMSE: './index.js'
  },
  target: 'node',
  output: {
    filename: 'DIMSE.js',
    library: 'DIMSE',
    libraryTarget: 'umd',
    path: outputPath,
    umdNamedDefine: true
  },
  devtool: 'source-map'
};
