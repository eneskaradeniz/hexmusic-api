const admin = require("firebase-admin");

const axios = require('axios').default;

const serviceAccount = require("./firebase-service-account.json");

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const firebaseAdmin = {};

firebaseAdmin.sendToDevice = async function({ title, body, token, data, channel_id, notification_type }) {
    if (!body || !token || !notification_type) return;
    return axios.post('https://fcm.googleapis.com/fcm/send',
            {
                to: token,
                notification: {
                    title,
                    body,
                    android_channel_id: channel_id,
                },
                data: {
                    ...data,
                    notification_type: notification_type,
                    click_action: "FLUTTER_NOTIFICATION_CLICK",
                    sound: "default",
                },
                priority: "high",
            },
            {
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `key=${process.env.FCM_SERVER_TOKEN}`,
                }
            }
    );
}

firebaseAdmin.sendMulticastNotification = function(payload) {
    console.log('payload:', payload);
    const message = {
        tokens: payload.tokens,
        notification: {
            title: payload.title,
            body: payload.body,
            android_channel_id: payload.channel_id,
        },
        data: {
            ...payload.data,
            notification_type: payload.notification_type,
            click_action: "FLUTTER_NOTIFICATION_CLICK",
            sound: "default",
        }
    };
    return admin.messaging().sendMulticast(message);
};

module.exports = firebaseAdmin;