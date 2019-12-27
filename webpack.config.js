// webpack.config.js
const webpack = require('webpack')
const path = require('path')

let PROD = JSON.parse(process.env.PROD_ENV || '0');

module.exports = {
  entry: {
    Broadcaster: path.resolve(__dirname, 'client/module/broadcaster.js'),
    Viewer: path.resolve(__dirname, 'client/module/viewer.js')
  },
  output: {
    publicPath: 'dist',
    path: path.resolve(__dirname, 'client/dist'),
    filename: PROD ? 'nile.[name].min.js' : 'nile.[name].js',
    library: '[name]',
    libraryTarget: 'umd',
    umdNamedDefine: true
  },
  module: {
    rules: [
      {
        test: /\.js$/,
        use: {
            loader: 'babel-loader',
            options: {}
        },
        // 排除不被应用编译
        exclude: '/node_modules/'       
      }
    ]
  },
  plugins: PROD ? [
    new webpack.optimize.UglifyJsPlugin({
      compress: { warnings: false }
    })
  ] : []
}