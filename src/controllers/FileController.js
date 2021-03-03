const mongoose = require('mongoose');
const ObjectId = require('mongoose').Types.ObjectId;

const connect = mongoose.connection;

const Error = require('./ErrorController');

var gfs;

connect.once('open', () => {
    gfs = new mongoose.mongo.GridFSBucket(connect.db, {
        bucketName: "uploads"
    });
});

class FileController {

    // GET /image:imageId

    async getImageById(req, res) {
        try {
            const imageId = req.params.imageId;

            if(!imageId) {
                return res.status(400).json({
                    success: false
                });
            }

            const files = await gfs.find({ _id: ObjectId(imageId) }).toArray();

            if (!files[0] || files.length === 0) {
                return res.status(404).json({
                    success: false
                });
            }

            if (files[0].contentType === 'image/jpeg' || files[0].contentType === 'image/png' || files[0].contentType === 'image/jpg') {
                gfs.openDownloadStream(ObjectId(imageId)).pipe(res);
            } else {
                return res.status(404).json({
                    success: false
                });
            }

            /*gfs.find({ _id: ObjectId(imageId) }).toArray((err, files) => {
                if(err) {
                    return res.status(400).json({
                        success: false,
                    })
                }

                if (!files[0] || files.length === 0) {
                    return res.status(200).json({
                        success: false
                    });
                }

                if (files[0].contentType === 'image/jpeg' || files[0].contentType === 'image/png' || files[0].contentType === 'image/jpg') {
                    // render image to browser
                    gfs.openDownloadStream(ObjectId(imageId)).pipe(res);
                } else {
                    return res.status(404).json({
                        success: false
                    });
                }
            });*/
        } catch(err) {
            Error({
                file: 'FileController.js',
                method: 'getImageById',
                info: err,
                type: 'critical',
            });

            return res.status(400).json({
                success: false,
            });
        }
    }

    // UTILS

    async deleteImageById(imageId) {
        try {
            if(!imageId) return false;
            await gfs.delete(ObjectId(imageId));

            return true;
        } catch(err) {
            throw err;
        }
    }

    async deleteImages(imageIds) {
        try {
            if(!imageIds) return;
            if(imageIds.length === 0) return;

            const promises = imageIds.map((imageId) => {
                return gfs.delete(ObjectId(imageId));
            });

            await Promise.all(promises);
        } catch(err) {
            Error({
                file: 'FileController.js',
                method: 'deleteImages',
                info: err,
                type: 'critical',
            });
        }
    }

}

module.exports = new FileController();