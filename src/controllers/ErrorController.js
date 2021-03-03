const Error = require('../models/ErrorModel');

const error = (data) => {
    try {
        return new Error({
            file: data.file,
            method: data.method,
            info: data.info,
            type: data.type
        }).save();
    } catch(err) {
        console.log('Error tutarken hata:', err);
    }
};

module.exports = error;