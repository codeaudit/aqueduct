const webpack = require('webpack');
const path = require('path');
const srcPath = path.resolve('./src');
const distPath = path.resolve('./dist');
const ExtractTextPlugin = require('extract-text-webpack-plugin');
const CleanWebpackPlugin = require('clean-webpack-plugin');
const CopyWebpackPlugin = require('copy-webpack-plugin');
const HtmlWebpackPlugin = require('html-webpack-plugin');

const config = {
  entry: {
    'index': `${srcPath}/index.tsx`
  },
  output: {
    path: distPath,
    filename: '[name].[hash].js',
    sourceMapFilename: '[file].map.json'
  },
  devServer: {
    contentBase: path.join(__dirname, "dist"),
    compress: true,
    port: 9000
  },
  module: {
    rules: [
      {
        test: /\.tsx$/,
        enforce: 'pre',
        loader: 'tslint-loader',
      },
      {
        test: /\.tsx?$/,
        loader: 'ts-loader'
      },
      {
        test: /\.scss|sass|css$/,
        loader: ExtractTextPlugin.extract({
          use: [
            {
              loader: 'css-loader'
            },
            {
              loader: 'sass-loader'
            }
          ]
        })
      },
      {
        test: /\.woff(\?v=\d+\.\d+\.\d+)?$/,
        loader: "url-loader?limit=10000&mimetype=application/font-woff"
      },
      {
        test: /\.woff2(\?v=\d+\.\d+\.\d+)?$/,
        loader: "url-loader?limit=10000&mimetype=application/font-woff"
      },
      {
        test: /\.ttf(\?v=\d+\.\d+\.\d+)?$/,
        loader: "url-loader?limit=10000&mimetype=application/octet-stream"
      },
      {
        test: /\.eot(\?v=\d+\.\d+\.\d+)?$/,
        loader: "file-loader"
      },
      {
        test: /\.svg(\?v=\d+\.\d+\.\d+)?$/,
        loader: "url-loader?limit=10000&mimetype=image/svg+xml"
      }
    ]
  },

  resolve: {
    extensions: ['.ts', '.js', '.tsx', '.css', '.scss', '.sass'],
    modules: [
      path.resolve(srcPath),
      'node_modules'
    ]
  },

  plugins: [
    new CopyWebpackPlugin([
      {
        from: './src/images',
        to: 'images'
      },
      {
        from: './src/frames',
        to: 'frames'
      }
    ]),
    new HtmlWebpackPlugin({
      title: 'Aqueduct | ERC dExchange',
      template: 'src/index.ejs'
    }), 
    new CleanWebpackPlugin(['dist']),
    new ExtractTextPlugin({
      filename: '[name].[hash].css'
    }),
    new webpack.ContextReplacementPlugin(/moment[\\\/]locale$/, /^\.\/(en)$/),
    new webpack.optimize.ModuleConcatenationPlugin()
  ],
  devtool: 'source-map'
};

module.exports = config;
