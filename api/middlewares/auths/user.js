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
                console.log(err);
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

            console.log('decoded:', decoded);
            
            if(!decoded._id) {
                console.log('decoded _id yok');
                return res.status(401).json({
                    success: false,
                    error: 'INVALID_TOKEN'
                });
            }

            req.bearerToken = token;
            req.tokenInfo = decoded;
            req._id = decoded._id;
            next();
        });
    } catch(err) {
        console.log('catch:', err);
        Error({
            file: 'user.js',
            method: 'middleware.user',
            title: err.toString(),
            info: err,
            type: 'critical',
        });

        return res.status(401).json({
            success: false
        });
    }
}
