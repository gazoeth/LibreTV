const { transformSync } = require('next/dist/build/swc');

module.exports = function safari12CompatLoader(source) {
  return transformSync(source.toString(), {
    filename: this.resourcePath,
    jsc: {
      parser: { syntax: 'ecmascript' },
      target: 'es2019',
    },
    module: { type: 'es6' },
  }).code;
};
