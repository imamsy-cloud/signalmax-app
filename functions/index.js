const functions = require("firebase-functions");
const admin = require("firebase-admin");

admin.initializeApp();

const db = admin.firestore();

exports.sendPushNotification = functions
    .region("asia-southeast2") // Opsional: pilih region yang lebih dekat
    .firestore.document("fcmTasks/{taskId}")
    .onCreate(async (snap, context) => {
      const taskData = snap.data();

      // 1. Ambil data dari task
      const {target, notificationPayload, linkUrl} = taskData;
      if (!target || !notificationPayload) {
        console.error("Task data is invalid:", taskData);
        return db.collection("fcmTasks").doc(snap.id).delete();
      }

      // 2. Tentukan query pengguna berdasarkan target
      let usersQuery = db.collection("users").where("isAdmin", "==", false);

      if (target === "premium") {
        usersQuery = usersQuery.where("isPremium", "==", true);
      } else if (target === "regular") {
        usersQuery = usersQuery.where("isPremium", "==", false);
      }
      // Jika target 'all', tidak perlu filter tambahan

      try {
        const usersSnapshot = await usersQuery.get();
        if (usersSnapshot.empty) {
          console.log("No users found for the target:", target);
          return db.collection("fcmTasks").doc(snap.id).delete();
        }

        // 3. Kumpulkan semua token FCM dari pengguna yang ditargetkan
        const tokens = [];
        usersSnapshot.forEach((doc) => {
          const userData = doc.data();
          if (userData.fcmTokens && Array.isArray(userData.fcmTokens)) {
            tokens.push(...userData.fcmTokens);
          }
        });

        if (tokens.length === 0) {
          console.log("No FCM tokens found for the targeted users.");
          return db.collection("fcmTasks").doc(snap.id).delete();
        }

        // 4. Kirim notifikasi menggunakan FCM
        const message = {
          notification: notificationPayload,
          webpush: {
            fcm_options: {
              link: linkUrl,
            },
            notification: {
              icon: notificationPayload.icon || "/icons/icon-192x192.png",
            },
          },
          tokens: [...new Set(tokens)], // Hapus token duplikat
        };

        const response = await admin.messaging().sendEachForMulticast(message);

        console.log(
            `Successfully sent ${response.successCount} messages`,
        );

        // (Opsional) Tambahkan logika untuk membersihkan token yang tidak valid
        if (response.failureCount > 0) {
          console.warn(`Failed to send ${response.failureCount} messages`);
        }
      } catch (error) {
        console.error("Error sending push notifications:", error);
      }

      // 5. Hapus task setelah selesai
      return db.collection("fcmTasks").doc(snap.id).delete();
    });
