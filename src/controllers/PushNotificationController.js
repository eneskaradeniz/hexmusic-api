const axios = require('axios').default;

class PushNotificationController {

    async send({title, body, fcmToken, data, channel_id, notification_type}) {
        if (!body || !fcmToken || !notification_type) return;
        try {
            axios.post('https://fcm.googleapis.com/fcm/send',
                {
                    to: fcmToken,
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
            )
        } catch (err) {
            throw err;
        }
    }

}

module.exports = new PushNotificationController();
