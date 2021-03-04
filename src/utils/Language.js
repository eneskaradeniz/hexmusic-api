class Language {
    static async translate({ key, lang }) {
        try {
            var data;

            switch(lang) {
                case 'tr':
                    data = {
                        "renew_likes_title": "Beğeni Hakların Yenilendi!",
                        "renew_likes_body": "Kaydırmaya kaldığın yerden devam et!",

                        "like_message": "Bir mesajını beğendi.",
                        "track_message": "%name sizinle %trackName dinlemek istiyor.",

                        "new_match_title": "Yeni Eşleşme!",
                        "new_match_body": "%name ile hisleriniz karşılıklı!",

                        "like_title": "Yeni Beğeni!",
                        "free_like_body": "Biri seni beğendi! Kim olduğunu öğrenmek için Premium satın al.",
                        "premium_like_body": "%name seni beğendi! Beni beğenenler sekmesinden kimin olduğunu gör.",

                        "mega_like_title": "Yeni Mega Like!",
                        "free_mega_like_body": "Biri seni çok beğendi! Kim olduğunu öğrenmek için Premium satın al.",
                        "premium_mega_like_body": "%name seni çok beğendi! Beni beğenenler sekmesinden kimin olduğunu gör."
                    };
                    break;
                case 'en':
                    data = {
                        "renew_likes_title": "Renewed Likes!",
                        "renew_likes_body": "Continue scrolling where you left off!",

                        "like_message": "Liked your message.",
                        "track_message": "%name wants to listen to %trackName with you.",

                        "new_match_title": "New Match!",
                        "new_match_body": "Your feelings with %name are mutual!",

                        "like_title": "New Like!",
                        "free_like_body": "Someone likes you! Buy Premium to find out who you are.",
                        "premium_like_body": "%name liked you! See who's on the likes me tab.",

                        "mega_like_title": "New Mega Like!",
                        "free_mega_like_body": "Someone Mega Liked you! Buy Premium to find out who you are.",
                        "premium_mega_like_body": "%name Mega Liked you! See who's on the likes me tab."
                    };
                    break;
            }
            if(!data) throw 'NOT_FOUND_DATA';
            return data[key];
        } catch(e) {
            throw e;
        }
    }
}

module.exports = Language;