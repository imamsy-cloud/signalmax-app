/**
 * File: functions/index.js
 * Deskripsi: Cloud Functions untuk menangani penghapusan data yatim (orphaned data)
 * secara otomatis di backend Firebase.
 */

const functions = require("firebase-functions");
const admin = require("firebase-admin");

// Inisialisasi Firebase Admin SDK
admin.initializeApp();
const db = admin.firestore();
const storage = admin.storage();

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
    // Jika tidak ada lagi dokumen, proses selesai.
    resolve();
    return;
  }

  // Hapus semua dokumen dalam batch
  const batch = db.batch();
  snapshot.docs.forEach((doc) => {
    batch.delete(doc.ref);
  });
  await batch.commit();

  // Ulangi proses untuk batch selanjutnya
  process.nextTick(() => {
    deleteQueryBatch(query, resolve);
  });
}


// ============================================================================
// TRIGGER 1: onUserDelete
// Terpicu saat sebuah dokumen pengguna dihapus dari koleksi 'users'.
// Tugas: Menghapus semua data yang terkait dengan pengguna tersebut.
// ============================================================================
exports.onUserDelete = functions.region("asia-southeast2")
    .firestore.document("users/{userId}")
    .onDelete(async (snap, context) => {
      const userId = context.params.userId;
      functions.logger.log(`Memulai proses pembersihan untuk pengguna: ${userId}`);

      const batch = db.batch();

      // 1. Hapus semua postingan yang dibuat oleh pengguna
      const postsQuery = db.collection("posts")
          .where("authorId", "==", userId);
      const userPosts = await postsQuery.get();
      userPosts.forEach((doc) => {
        functions.logger.log(`Menghapus postingan: ${doc.id}`);
        batch.delete(doc.ref);
      });

      // 2. Hapus semua story yang dibuat oleh pengguna
      const storiesQuery = db.collection("stories")
          .where("userId", "==", userId);
      const userStories = await storiesQuery.get();
      userStories.forEach((doc) => {
        functions.logger.log(`Menghapus story: ${doc.id}`);
        // Hapus juga file gambar dari Storage
        if (doc.data().imageUrl) {
          const fileUrl = doc.data().imageUrl;
          try {
            // Ekstrak path file dari URL
            const filePath = new URL(fileUrl).pathname.split("/o/")[1].split("?")[0];
            storage.bucket().file(decodeURIComponent(filePath)).delete();
          } catch (e) {
            functions.logger.error("Gagal menghapus file story dari storage:", e);
          }
        }
        batch.delete(doc.ref);
      });

      // 3. Hapus semua sub-koleksi milik pengguna (notifikasi, progres, dll.)
      const userSubCollections = [
        `users/${userId}/notifications`,
        `users/${userId}/completedLessons`,
      ];

      for (const path of userSubCollections) {
        functions.logger.log(`Menghapus sub-koleksi di path: ${path}`);
        await deleteCollection(path, 100);
      }

      // Jalankan semua operasi penghapusan
      await batch.commit();
      functions.logger.log(`Pembersihan untuk pengguna ${userId} selesai.`);
      return null;
    });


// ============================================================================
// TRIGGER 2: onCourseDelete
// Terpicu saat sebuah dokumen kursus dihapus dari koleksi 'courses'.
// Tugas: Menghapus semua sub-koleksi di dalam kursus tersebut.
// ============================================================================
exports.onCourseDelete = functions.region("asia-southeast2")
    .firestore.document("courses/{courseId}")
    .onDelete(async (snap, context) => {
      const courseId = context.params.courseId;
      functions.logger.log(`Memulai proses pembersihan untuk kursus: ${courseId}`);

      // Daftar sub-koleksi yang ada di dalam sebuah kursus
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
