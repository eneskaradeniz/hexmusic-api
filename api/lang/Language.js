const tr = require('./langs/tr.json');
const en = require('./langs/en.json');

class Language {
    static translate({ key, lang }) {
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