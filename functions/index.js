/**
 * File: functions/index.js
 * Deskripsi: Cloud Functions untuk backend SignalMax.
 * Termasuk:
 * - Pengiriman Push Notification
 * - Cleanup data otomatis
 */

const functions = require("firebase-functions");
const admin = require("firebase-admin");

// Inisialisasi Firebase Admin SDK
admin.initializeApp();
const db = admin.firestore();
const storage = admin.storage();
const messaging = admin.messaging(); // <-- Tambahan untuk FCM

// ============================================================================
// FUNGSI BARU: PENGIRIM NOTIFIKASI
// Terpicu saat dipanggil dari aplikasi admin (Callable Function).
// ============================================================================
exports.sendTargetedPushNotification = functions.region("asia-southeast2")
  .https.onCall(async (data, context) => {
    // Validasi #1: Pastikan pengguna sudah login
    if (!context.auth) {
      throw new functions.https.HttpsError("unauthenticated", "Anda harus login untuk melakukan aksi ini.");
    }

    // Validasi #2: Pastikan pengguna yang memanggil adalah admin
    const callerDoc = await db.collection("users").doc(context.auth.uid).get();
    if (!callerDoc.exists || !callerDoc.data().isAdmin) {
      throw new functions.https.HttpsError("permission-denied", "Hanya admin yang bisa mengirim notifikasi.");
    }
    
    const { target, title, body } = data;
    if (!target || !title || !body) {
      throw new functions.https.HttpsError("invalid-argument", "Payload tidak lengkap. Harus ada target, title, dan body.");
    }

    // Ambil dokumen pengguna berdasarkan target
    let usersQuery = db.collection("users").where("fcmTokens", "!=", null);
    if (target === "premium") {
      usersQuery = usersQuery.where("isPremium", "==", true);
    } else if (target === "non-premium") {
      usersQuery = usersQuery.where("isPremium", "!=", true);
    }
    
    const usersSnapshot = await usersQuery.get();
    if (usersSnapshot.empty) {
      console.log("Tidak ada pengguna target yang ditemukan.");
      return { success: true, message: "Tidak ada pengguna target yang ditemukan." };
    }

    // Kumpulkan semua FCM token dari pengguna yang ditargetkan
    const tokens = [];
    usersSnapshot.forEach(doc => {
      const userData = doc.data();
      if (userData.fcmTokens && Array.isArray(userData.fcmTokens) && userData.fcmTokens.length > 0) {
        tokens.push(...userData.fcmTokens);
      }
    });

    if (tokens.length === 0) {
      console.log("Tidak ada token FCM yang valid untuk dikirimi pesan.");
      return { success: true, sentCount: 0, message: "Tidak ada token yang valid." };
    }

    // Buat payload notifikasi
    const message = {
      notification: { title, body },
      tokens: [...new Set(tokens)], // Hapus token duplikat untuk efisiensi
    };

    // Kirim notifikasi menggunakan FCM Admin SDK
    try {
      const response = await messaging.sendEachForMulticast(message);
      functions.logger.log(`Berhasil mengirim notifikasi ke ${response.successCount} dari ${tokens.length} token.`);
      
      // Di sini Anda bisa menambahkan logika untuk membersihkan token yang tidak valid/kadaluarsa jika perlu
      
      return { success: true, sentCount: response.successCount, failureCount: response.failureCount };
    } catch (error) {
      functions.logger.error("Gagal mengirim notifikasi via FCM:", error);
      throw new functions.https.HttpsError("internal", "Terjadi kesalahan internal saat mengirim notifikasi.");
    }
  });


// ============================================================================
// FUNGSI LAMA ANDA (UNTUK CLEANUP DATA)
// ============================================================================

/**
 * Fungsi pembantu untuk menghapus koleksi dan sub-koleksinya secara rekursif.
 * @param {string} collectionPath - Path menuju koleksi yang akan dihapus.
 * @param {number} batchSize - Jumlah dokumen yang akan dihapus per batch.
 */
async function deleteCollection(collectionPath, batchSize) {
  const collectionRef = db.collection(collectionPath);
  const query = collectionRef.orderBy("__name__").limit(batchSize);

  return new Promise((resolve, reject) => {
    deleteQueryBatch(query, resolve).catch(reject);
  });
}

async function deleteQueryBatch(query, resolve) {
  const snapshot = await query.get();

  const batchSize = snapshot.size;
  if (batchSize === 0) {
    resolve();
    return;
  }

  const batch = db.batch();
  snapshot.docs.forEach((doc) => {
    batch.delete(doc.ref);
  });
  await batch.commit();

  process.nextTick(() => {
    deleteQueryBatch(query, resolve);
  });
}

// TRIGGER 1: onUserDelete
exports.onUserDelete = functions.region("asia-southeast2")
    .firestore.document("users/{userId}")
    .onDelete(async (snap, context) => {
      const userId = context.params.userId;
      functions.logger.log(`Memulai proses pembersihan untuk pengguna: ${userId}`);

      const batch = db.batch();

      const postsQuery = db.collection("posts").where("authorId", "==", userId);
      const userPosts = await postsQuery.get();
      userPosts.forEach((doc) => {
        functions.logger.log(`Menghapus postingan: ${doc.id}`);
        batch.delete(doc.ref);
      });

      const storiesQuery = db.collection("stories").where("userId", "==", userId);
      const userStories = await storiesQuery.get();
      userStories.forEach((doc) => {
        functions.logger.log(`Menghapus story: ${doc.id}`);
        if (doc.data().imageUrl) {
          const fileUrl = doc.data().imageUrl;
          try {
            const filePath = new URL(fileUrl).pathname.split("/o/")[1].split("?")[0];
            storage.bucket().file(decodeURIComponent(filePath)).delete();
          } catch (e) {
            functions.logger.error("Gagal menghapus file story dari storage:", e);
          }
        }
        batch.delete(doc.ref);
      });

      const userSubCollections = [
        `users/${userId}/notifications`,
        `users/${userId}/completedLessons`,
      ];

      for (const path of userSubCollections) {
        functions.logger.log(`Menghapus sub-koleksi di path: ${path}`);
        await deleteCollection(path, 100);
      }

      await batch.commit();
      functions.logger.log(`Pembersihan untuk pengguna ${userId} selesai.`);
      return null;
    });

// TRIGGER 2: onCourseDelete
exports.onCourseDelete = functions.region("asia-southeast2")
    .firestore.document("courses/{courseId}")
    .onDelete(async (snap, context) => {
      const courseId = context.params.courseId;
      functions.logger.log(`Memulai proses pembersihan untuk kursus: ${courseId}`);

      const courseSubCollections = [
        `courses/${courseId}/chapters`,
        `courses/${courseId}/questions`,
        `courses/${courseId}/quizSettings`,
      ];

      for (const path of courseSubCollections) {
        functions.logger.log(`Menghapus sub-koleksi di path: ${path}`);
        await deleteCollection(path, 100);
      }

      functions.logger.log(`Pembersihan untuk kursus ${courseId} selesai.`);
      return null;
    });