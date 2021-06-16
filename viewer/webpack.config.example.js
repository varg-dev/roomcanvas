'use strict';

const path = require('path');
const webpack = require('webpack');

require('dotenv').config();

const GitRevisionPlugin = require('git-revision-webpack-plugin');
const CopyWebpackPlugin = require('copy-webpack-plugin');
const HtmlWebpackPlugin = require('html-webpack-plugin');
const MiniCssExtractPlugin = require('mini-css-extract-plugin');
const WriteJsonPlugin = require('write-json-webpack-plugin');
const { readdirSync } = require('fs');
const { join } = require('path');

const gitrev = new GitRevisionPlugin();

const entries = {
    basic: './index.tsx',
    'css/styles': './scss/styles.scss',
};

const availableBuildingModels = readdirSync(join(__dirname, 'example', 'data', 'building-models'), { withFileTypes: true })
    .filter((dirent) => dirent.isDirectory())
    .map((dirent, index) => ({
        id: index,
        label: dirent.name,
        assetContentRoot: join('data', 'building-models', dirent.name, '/'),
    }))

module.exports = (env, argv) => {
    let config = {};

    if (argv.mode === 'development') {
        config.devtool = 'eval-source-map';
    }

    if (argv.mode === 'production') {
        // Don’t set the config.devtool, i.e., don’t emit source maps
    }

    config = {
        ...config,
        context: __dirname + '/example',
        cache: false,
        entry: entries,
        plugins: [
            new webpack.DefinePlugin({
                GIT_REV_VERSION: JSON.stringify(gitrev.version()),
                GIT_REV_COMMIT: JSON.stringify(gitrev.commithash()),
                GIT_REV_BRANCH: JSON.stringify(gitrev.branch()),
                DISABLE_ASSERTIONS: JSON.stringify(false),
                LOG_VERBOSITY_THRESHOLD: JSON.stringify(3),
            }),
            new WriteJsonPlugin({
                object: availableBuildingModels,
                path: 'data',
                filename: 'availableBuildingModels.json',
                pretty: true,
            }),
            new CopyWebpackPlugin([
                { from: './data', to: './data' },
                { from: './fonts', to: './fonts' },
            ]),
            new HtmlWebpackPlugin({
                template: path.resolve(__dirname, './example', 'index.html'),
            }),
            new MiniCssExtractPlugin({
                filename: '[name].css',
            }),
        ],
        output: {
            path: __dirname + '/build/example',
            filename: '[name].js',
            library: undefined,
            libraryTarget: 'umd',
        },
        devServer: {
            contentBase: path.resolve(__dirname, './source'),
            watchContentBase: true,
            headers: {
                'Access-Control-Allow-Origin': 'http://localhost:3000',
                'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-id, Content-Length, X-Requested-With',
                'Access-Control-Allow-Methods': 'GET, OPTIONS',
            },
            proxy: {
                '/tasa_api': 'http://localhost:3001/',
                '/de': 'http://localhost:3001/',
                '/cable': {
                    target: 'http://localhost:3001/',
                    ws: true,
                },
            },
        },
        resolve: {
            modules: [__dirname + '/node_modules', __dirname + '/source'],
            extensions: ['.ts', '.tsx', '.js'],
        },
        watchOptions: {
            ignored: ['node_modules/**'],
        },
        module: {
            rules: [
                {
                    test: /\.tsx?$/,
                    include: /(example|source)/,
                    exclude: /(miscellaneous|node_modules)/,
                    use: {
                        loader: 'ts-loader',
                        options: {
                            compilerOptions: {
                                declaration: false,
                                noUnusedLocals: true,
                                removeComments: true,
                            },
                        },
                    },
                },
                {
                    test: /\.(glsl|vert|frag)$/,
                    exclude: /(node_modules)/,
                    use: { loader: 'webpack-glsl-loader' },
                },
                {
                    test: /\.(glb|gltf|png|fnt)$/,
                    use: [
                        {
                            loader: 'url-loader',
                            options: {
                                limit: 1,
                                esModule: false,
                                name: '[path][name].[ext]',
                            },
                        },
                    ],
                },
                {
                    test: /\.pug$/,
                    exclude: /(node_modules)/,
                    use: ['pug-loader'],
                },
                {
                    enforce: 'pre',
                    test: /\.jsx?$/,
                    loader: 'source-map-loader',
                    exclude: [
                        // Based on: https://github.com/angular-redux/store/issues/64#issuecomment-223489640
                        // these packages have problems with their sourcemaps
                        __dirname + '/node_modules/interval-arithmetic',
                        __dirname + '/node_modules/function-plot',
                      ]
                },
                {
                    test: /\.s[ac]ss$/,
                    use: [
                        MiniCssExtractPlugin.loader,
                        'css-loader',
                        {
                            loader: 'sass-loader',
                            options: {
                                sassOptions: {
                                    includePaths: ['node_modules/bootstrap/scss/'],
                                },
                            },
                        },
                    ],
                },
            ],
        },
    };

    return config;
};
