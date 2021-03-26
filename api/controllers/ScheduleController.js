
const schedule = require('node-schedule');
const Language = require('./api/lang/Language');

const lodash = require("lodash");
const FirebaseAdmin = require("./api/firebase/FirebaseAdmin");

const DEFAULT_LIKE_COUNT = 30;
const DEFAULT_ADS_COUNT = 5;

class ScheduleController {
   
    async startRenewCounts() {
        // EVERY DAY RENEW USER COUNTS

        schedule.scheduleJob('0 15 0 * * *', async () => {
            try {
                const results = await Promise.all([
                    User.find({ "notifications.renew_likes": true }).select('fcm_token language'),
                    User.updateMany({ product: { $eq: 'free' } }, { counts: { like: DEFAULT_LIKE_COUNT, mega_like: 1, ad: DEFAULT_ADS_COUNT }}),
                    User.updateMany({ product: { $eq: 'premium_lite' } }, { counts: { like: DEFAULT_LIKE_COUNT, mega_like: 3, ad: DEFAULT_ADS_COUNT }}),
                    User.updateMany({ product: { $eq: 'premium_plus' } }, { counts: { like: DEFAULT_LIKE_COUNT, mega_like: 5, ad: DEFAULT_ADS_COUNT }}),
                ]);
        
                const users = results[0];
        
                var tr_tokens = [];
                var en_tokens = [];
        
                users.forEach(user => {
                    switch(user.language) {
                        case 'tr':
                            if(user.fcm_token != null) tr_tokens.push(user.fcm_token.token);
                            break;
                        case 'en':
                            if(user.fcm_token != null) en_tokens.push(user.fcm_token.token);
                            break;
                    }
                });
        
                const tr_title = Language.translate({ key: 'renew_likes_title', lang: 'tr' });
                const tr_body = Language.translate({ key: 'renew_likes_body', lang: 'tr' });
        
                const en_title = Language.translate({ key: 'renew_likes_title', lang: 'en' });
                const en_body = Language.translate({ key: 'renew_likes_body', lang: 'en' });
        
                const tr_chunks = lodash.chunk(tr_tokens, 500);
                const en_chunks = lodash.chunk(en_tokens, 500);
        
                // TR İÇİN
                const promisesTR = tr_chunks.map((tokens) => {
                    const payload = {
                        tokens,
                        title: tr_title,
                        body: tr_body,
                        channel_id: 'match',
                        data: {
                            notification_type: 'RENEW_LIKES',
                        }
                    };
        
                    return FirebaseAdmin.sendMulticastNotification(payload); 
                });
        
                // EN İÇİN
                const promisesEN = en_chunks.map((tokens) => {
                    const payload = {
                        tokens,   
                        title: en_title,
                        body: en_body,
                        channel_id: 'match',
                        data: {
                            notification_type: 'RENEW_LIKES',
                        }
                    };
            
                    return FirebaseAdmin.sendMulticastNotification(payload); 
                });
        
                await Promise.all([promisesTR, promisesEN]);
            } catch(err) {
                Error({
                    file: 'server.js',
                    method: 'daily_renew',
                    title: err.toString(),
                    info: err,
                    type: 'critical',
                });
            }
        });
    }
}

module.exports = ScheduleController;