const Error = require('./ErrorController');

const fs = require('fs');

const avatar_path = './avatars/';

class FileController {

    async deleteAvatar(avatar_id) {
        try {
            if(!avatar_id) return false;
            const path = avatar_path + avatar_id;

            if(fs.existsSync(path)) {
                fs.unlinkSync(avatar_path + avatar_id);
                return true;
            }

            return false;
        } catch(err) {
            throw err;
        }
    }

    async deleteAvatars(avatar_ids) {
        try {
            if(!avatar_ids) return;
            if(avatar_ids.length === 0) return;

            const promises = avatar_ids.map((avatar_id) => {
                const path = avatar_path + avatar_id;
                if(fs.existsSync(path)) {
                    return fs.unlinkSync(path);
                }
            });
            await Promise.all(promises);
        } catch(err) {
            Error({
                file: 'FileController.js',
                method: 'deleteAvatars',
                title: err.toString(),
                info: err,
                type: 'critical',
            });
        }
    }

}

module.exports = new FileController();