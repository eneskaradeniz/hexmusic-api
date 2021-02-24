require('dotenv').config();
const mongoose = require('mongoose');

module.exports = {
    async connect(){
        try {
            return await mongoose.connect(process.env.MONGO_URI, {
                useNewUrlParser: true,
                useUnifiedTopology: true,
                useCreateIndex: true,
                useFindAndModify: false,
            });
        } catch (err){
            console.error("Authentication failed for MongoDB\nerror:", err);
            return null;
        }
    }
}
