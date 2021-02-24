const mongoose = require('mongoose');
const ObjectId = require('mongoose').Types.ObjectId;

const connect = mongoose.connection;

const Log = require('./LogController');

var gfs;

connect.once('open', () => {
    // initialize stream
    gfs = new mongoose.mongo.GridFSBucket(connect.db, {
        bucketName: "uploads"
    });
});

class FileController {

    // GET /files

    async getFiles(req, res) {
        try {
            gfs.find().toArray((err, files) => {
                if(err) {
                    console.log(err);
                    return res.status(200).json({
                        success: false,
                    });
                }
    
                if (!files || files.length === 0) {
                    return res.status(200).json({
                        success: false
                    });
                }
    
                files.map(file => {
                    if (file.contentType === 'image/jpeg' || file.contentType === 'image/png' || file.contentType === 'image/svg' || file.contentType === 'image/heic') {
                        file.isImage = true;
                    } else {
                        file.isImage = false;
                    }
                });
    
                return res.status(200).json({
                    success: true,
                    files,
                });
            });    
        } catch (e) {
            console.log(e);
            return res.status(400).json({
                success: false,
            });
        }
    }

    // GET /file/:fileId

    async getFileById(req, res) {
        try {
            const fileId = req.params.fileId;

            if(!fileId) {
                return res.status(400).json({
                    success: false
                });
            }

            gfs.find({ _id: ObjectId(fileId) }).toArray((err, files) => {
                if(err) {
                    console.log(err);
                    return res.status(200).json({
                        success: false,
                    });
                }

                if (!files[0] || files.length === 0) {
                    return res.status(200).json({
                        success: false
                    });
                }
    
                return res.status(200).json({
                    success: true,
                    file: files[0],
                });
            });   

        } catch (e) {
            console.log(e);
            return res.status(400).json({
                success: false,
            });
        }
    }

    // DELETE /file/:fileId

    async deleteFileById(req, res) {
        try {
            const fileId = req.params.fileId;

            if(!fileId) {
                return res.status(400).json({
                    success: false
                });
            }

            gfs.delete(ObjectId(fileId), (err, data) => {
                if (err) {
                    return res.status(404).json({ 
                        success: false,
                     });
                }

                return res.status(200).json({
                    success: true
                });
            });

        } catch(e) {
            console.log(e);
            return res.status(400).json({
                success: false,
            });
        }
    }

    // GET /image:imageId

    async getImageById(req, res) {
        try {
            const imageId = req.params.imageId;

            if(!imageId) {
                return res.status(400).json({
                    success: false
                });
            }

            gfs.find({ _id: ObjectId(imageId) }).toArray((err, files) => {
                if(err) {
                    console.log(err);
                    return res.status(400).json({
                        success: false,
                    })
                }

                if (!files[0] || files.length === 0) {
                    console.log('resim bulunamadı');
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
            });
        } catch(e) {
            console.log(e);
            return res.status(400).json({
                success: false,
            });
        }
    }

    // FUNCTION DELETE IMAGE

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
            Log({
                file: 'FileController.js',
                method: 'deleteImages',
                info: err,
                type: 'critical',
            });
        }
    }

}

module.exports = new FileController();