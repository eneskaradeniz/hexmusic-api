const Log = require('../models/LogModel');

const log = (data) => {
    try {
        return new Log({
            file: data.file,
            method: data.method,
            info: data.info,
            type: data.type
        }).save();
    } catch(err) {
        console.log('log tutarken hata:', err);
    }
};

module.exports = log;