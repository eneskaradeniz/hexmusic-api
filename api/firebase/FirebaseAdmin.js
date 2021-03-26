const admin = require("firebase-admin");

const serviceAccount = require("./firebase-service-account.json");

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const firebaseAdmin = {};

firebaseAdmin.sendToDevice = function({ title, body, token, data, channel_id, notification_type }) {
    const payload = {
        notification: {
            title,
            body,
            android_channel_id: channel_id,
        },
        data: {
            ...data,
            notification_type: notification_type,
            click_action: 'FLUTTER_NOTIFICATION_CLICK',
            sound: 'default',
        },
    };

    console.log(payload);

    const options = {
        priority: 'high',
    };

    console.log(options);

    return admin.messaging().sendToDevice(token, payload, options);
};

firebaseAdmin.sendMulticastNotification = function(payload) {
    const message = {
        notification: {
            title: payload.title,
            body: payload.body,
            android_channel_id: payload.channel_id,
        },
        tokens: payload.tokens,
        data: payload.data || {}
    };
    return admin.messaging().sendMulticast(message);
};

module.exports = firebaseAdmin;