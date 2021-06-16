'use strict';

const webpack = require('webpack');

require('dotenv').config();

// Setup global, additional definitions for the build/configuration.
var DEFINITIONS = {
    DISABLE_ASSERTIONS: JSON.stringify(false),
    LOG_VERBOSITY_THRESHOLD: JSON.stringify(3),
};

// If configured from within a git repository, add revision information to DEFINITIONS.
const GitRevisionPlugin = require('git-revision-webpack-plugin');
const gitrev = new GitRevisionPlugin();

DEFINITIONS.GIT_REV_VERSION = JSON.stringify(gitrev.version());
DEFINITIONS.GIT_REV_COMMIT = JSON.stringify(gitrev.commithash());
DEFINITIONS.GIT_REV_BRANCH = JSON.stringify(gitrev.branch());

const availableBuildingModels = readdirSync(join(__dirname, 'example', 'data', 'building-models'), { withFileTypes: true })
    .filter((dirent) => dirent.isDirectory())
    .map((dirent, index) => ({
        id: index,
        label: dirent.name,
        assetContentRoot: join('data', 'building-models', dirent.name, '/'),
    }))

const CopyWebpackPlugin = require('copy-webpack-plugin');
const WriteJsonPlugin = require('write-json-webpack-plugin');
const { readdirSync } = require('fs');
const { join } = require('path');

module.exports = {
    context: __dirname + '/source',
    cache: false,
    entry: {
        'roomcanvas-react.js': ['roomcanvas-react.ts'],
    },
    devtool: 'source-map',
    externals: {
        'react': 'react',
        'react-dom': 'react-dom',
        'react-router': 'react-router',
    },
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
            { from: 'data', to: 'data' },
            { from: 'fonts', to: 'fonts' },
            { from: 'img', to: 'img' },
        ]),
    ],
    output: {
        path: __dirname + '/lib',
        filename: '[name]',
        library: '@varg-dev/roomcanvas',
        libraryTarget: 'umd',
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
                include: /source/,
                exclude: /(source\/renderer\/shaders|website|example|node_modules)/,
                use: {
                    loader: 'ts-loader',
                    options: {
                        compilerOptions: {
                            declaration: true,
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
        ],
    },
};
