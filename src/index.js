import { parse, walk } from 'css-tree'

export default class WebpackCssClassExtractPlugin {
    constructor(options = {}) {
        this.options = {
            outputFilename: null,
            ...options,
        }
    }

    apply(compiler) {
        const { webpack } = compiler
        const { Compilation } = webpack
        const { RawSource } = webpack.sources

        // Following usage from https://github.com/WordPress/gutenberg/blob/trunk/packages/dependency-extraction-webpack-plugin/lib/index.js
        compiler.hooks.thisCompilation.tap(this.constructor.name, (compilation) => {
            compilation.hooks.processAssets.tap(
                {
                    name: this.constructor.name,
                    stage: Compilation.PROCESS_ASSETS_STAGE_ANALYSE,
                },
                () => {
                    const entryChunks = new Set()

                    for (const entry of compilation.entrypoints.values()) {
                        for (const chunk of entry.chunks) {
                            entryChunks.add(chunk)
                        }
                    }

                    for (const chunk of entryChunks) {
                        const files = Array.from(chunk.files)
                        const cssFile = files.find((f) => /\.css$/i.test(f))

                        if (!cssFile) {
                            continue
                        }

                        const { hashFunction, hashDigest, hashDigestLength } = compilation.outputOptions

                        const contentHash = files
                            .sort()
                            .reduce(
                                (hash, name) => hash.update(compilation.getAsset(name).source.buffer()),
                                webpack.util.createHash(hashFunction)
                            )
                            .digest(hashDigest)
                            .slice(0, hashDigestLength)

                        const { outputFilename } = this.options

                        let filename = ''

                        if (outputFilename) {
                            filename = compilation.getPath(outputFilename, {
                                chunk,
                                filename: cssFile,
                                contentHash,
                            })
                        } else {
                            filename = compilation.getPath('[file]', {
                                filename: cssFile,
                            }).replace(/\.css$/i, '.json')
                        }

                        const value = this.parse(compilation.getAsset(cssFile).source.source().toString())

                        compilation.emitAsset(filename, new RawSource(JSON.stringify(value)))
                        chunk.files.add(filename)
                    }
                },
            )
        })
    }

    parse(value) {
        const classes = new Set()
        const ast = parse(value)

        walk(ast, {
            visit: 'ClassSelector',
            enter(node) {
                // Remove backslashes
                classes.add(node.name.replace(/\\/g, ''))
            },
        })

        return Array.from(classes)
    }
}
