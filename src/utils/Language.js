const tr = require('../lang/tr.json');
const en = require('../lang/en.json');

class Language {
    static async translate({ key, lang }) {
        try {
            var value;

            switch(lang) {
                case 'tr':
                    value = tr[key];
                    break;
                case 'en':
                    value = en[key];
                    break;
            }

            return value;
        } catch(err) {
            throw err;
        }
    }
}

module.exports = Language;