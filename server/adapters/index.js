// Env-selected adapter. Routes only import from here, never a concrete adapter,
// so switching FM_MODE requires no route or frontend changes.
const mode = (process.env.FM_MODE || 'mock').toLowerCase();

module.exports = mode === 'odata' ? require('./odataAdapter') : require('./mockAdapter');
module.exports.mode = mode;
