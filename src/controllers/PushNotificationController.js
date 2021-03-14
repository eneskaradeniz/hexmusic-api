const axios = require('axios').default;

class PushNotificationController {

    async send({title, body, fcm_token, data, channel_id, notification_type}) {
        if (!body || !fcm_token || !notification_type) return;
        try {
            await axios.post('https://fcm.googleapis.com/fcm/send',
                {
                    to: fcm_token,
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
        } catch (err) {
            throw err;
        }
    }

}

module.exports = new PushNotificationController();
