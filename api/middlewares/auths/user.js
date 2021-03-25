require('dotenv').config();

const jwt = require('jsonwebtoken');
const Error = require('../../controllers/ErrorController');

module.exports = async (req, res, next) => {
    try {
        const authHeader = req.headers.authorization;

        if (!authHeader) {
            return res.status(401).json({
                success: false,
                error: 'NOT_FOUND_TOKEN'
            });
        } 

        const arrayAuth = authHeader.split(' ');
        if (arrayAuth.length != 2 || arrayAuth[0] != 'Bearer') {
            return res.status(401).json({
                success: false,
                error: 'NOT_FOUND_TOKEN'
            });
        }
        
        const token = arrayAuth[1];
        req.bearerToken = token;

        jwt.verify(token, process.env.JWT_SECRET, async (err, decoded) => {
            if (err){
                let error;
                switch(err.name){
                    case 'TokenExpiredError':
                        error = 'TOKEN_EXPIRED';
                        break;
                    default:
                        error = 'INVALID_TOKEN';
                        break;
                }

                return res.status(401).json({
                    success: false,
                    error
                });
            }

            /*const userExists = await User.countDocuments({ _id: decoded._id });
            if (userExists <= 0) {
                return res.status(401).json({
                    success: false,
                    error: 'NOT_FOUND_USER'
                });
            }*/

            req.bearerToken = token;
            req.tokenInfo = decoded;
            req._id = decoded._id;
            next();
        });
    } catch(err) {
        Error({
            file: 'user.js',
            method: 'module.exports',
            title: err.toString(),
            info: err,
            type: 'critical',
        });

        return res.status(401).json({
            success: false
        });
    }
}
