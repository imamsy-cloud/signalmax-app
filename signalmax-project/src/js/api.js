// File: src/js/api.js
// Deskripsi: Inisialisasi Firebase dan fungsi-fungsi interaksi database.
// Versi: 4.0 (Fitur Komunitas Lanjutan)
// Perubahan:
// - Menambahkan fungsi `editComment` untuk mengedit komentar.
// - Menambahkan fungsi `sendMentionNotifications` untuk menangani @mention.
// - Memodifikasi `submitComment` untuk mendukung balasan (threaded comments) dan memicu notifikasi mention.

import { firebaseConfig } from './config.js';
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
    getAuth, onAuthStateChanged, GoogleAuthProvider, signInWithPopup,
    createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut,
    updatePassword, EmailAuthProvider, reauthenticateWithCredential,
    deleteUser, sendPasswordResetEmail
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
    getFirestore, collection, getDoc, getDocs, doc, serverTimestamp,
    setDoc, updateDoc, increment, query, where, orderBy, onSnapshot,
    addDoc, deleteDoc, limit, arrayUnion, arrayRemove, writeBatch,
    documentId, startAfter, startAt
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import {
    getStorage, ref, uploadBytes, getDownloadURL, deleteObject
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-storage.js";

// === INISIALISASI FIREBASE ===
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const storage = getStorage(app);

// === EKSPOR LAYANAN & FUNGSI FIREBASE ===
export {
    auth, db, storage,
    onAuthStateChanged, GoogleAuthProvider, signInWithPopup,
    createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut,
    updatePassword, EmailAuthProvider, reauthenticateWithCredential,
    deleteUser, sendPasswordResetEmail,
    collection, getDoc, getDocs, doc, serverTimestamp, setDoc, updateDoc,
    increment, query, where, orderBy, onSnapshot, addDoc, deleteDoc, limit,
    arrayUnion, arrayRemove, writeBatch, documentId,
    startAfter, startAt,
    ref, uploadBytes, getDownloadURL, deleteObject
};


// === FUNGSI LOGIKA APLIKASI YANG DIGUNAKAN BERSAMA ===

export async function adminSendTargetedNotification(target, payload) {
    const usersQuery = query(collection(db, "users"), where('isAdmin', '==', false));
    const allUsersSnapshot = await getDocs(usersQuery);

    let targetedUsers = [];
    if (target === 'all') {
        targetedUsers = allUsersSnapshot.docs;
    } else if (target === 'premium') {
        targetedUsers = allUsersSnapshot.docs.filter(doc => doc.data().isPremium === true);
    } else {
        targetedUsers = allUsersSnapshot.docs.filter(doc => doc.data().isPremium !== true);
    }

    if (targetedUsers.length === 0) {
        throw new Error("Tidak ada pengguna yang cocok dengan target yang dipilih.");
    }

    const batch = writeBatch(db);
    targetedUsers.forEach(userDoc => {
        const notificationRef = doc(collection(db, `users/${userDoc.id}/notifications`));
        batch.set(notificationRef, {
            ...payload,
            isRead: false,
            createdAt: serverTimestamp()
        });
    });

    const historyRef = doc(collection(db, "adminNotificationHistory"));
    batch.set(historyRef, {
        ...payload,
        target: target,
        sentAt: serverTimestamp(),
        recipientCount: targetedUsers.length
    });
    await batch.commit();
}

export async function sendSignalNotification(signalData, signalId) {
    const notificationPayload = {
        title: signalData.isPremium ? "Sinyal Premium Baru!" : "Sinyal Baru Dirilis!",
        body: `${signalData.action} sinyal untuk ${signalData.pair} telah diposting.`,
        isRead: false,
        createdAt: serverTimestamp(),
        type: 'new_signal',
        link: {
            screen: 'signals',
            params: { signalId: signalId }
        }
    };

    try {
        const usersQuery = query(
            collection(db, "users"),
            where('isAdmin', '==', false),
            where('notificationSettings.newSignal', '==', true)
        );
        const usersSnapshot = await getDocs(usersQuery);
        
        if (usersSnapshot.empty) { return; }

        const batch = writeBatch(db);
        usersSnapshot.forEach(userDoc => {
            const userNotificationsRef = doc(collection(db, `users/${userDoc.id}/notifications`));
            batch.set(userNotificationsRef, notificationPayload);
        });
        await batch.commit();
    } catch (error) {
        console.error("Terjadi kesalahan saat mengirim notifikasi sinyal:", error);
    }
}


export async function initiatePaymentRequest(userId, userEmail, plan) {
    try {
        const paymentRequestCol = collection(db, "paymentRequests");
        await addDoc(paymentRequestCol, {
            userId: userId,
            userEmail: userEmail,
            plan: plan,
            requestDate: serverTimestamp(),
            status: "pending"
        });
    } catch (error) {
        console.error("Gagal membuat payment request:", error);
        throw new Error("Gagal memulai sesi pembayaran.");
    }
}


export async function handleLikePost(postId, currentUserData) {
    if (!auth.currentUser) return;
    const postRef = doc(db, "posts", postId);
    const postSnap = await getDoc(postRef);
    if (!postSnap.exists()) return;

    const postData = postSnap.data();
    const authorRef = doc(db, "users", postData.authorId);
    const isLiked = postData.likedBy?.includes(auth.currentUser.uid);
    const reputationPoints = currentUserData.isExpert ? 5 : 1;

    const batch = writeBatch(db);

    if (postData.authorId !== auth.currentUser.uid) {
        batch.update(authorRef, {
            'stats.reputation': isLiked ? increment(-reputationPoints) : increment(reputationPoints)
        });
    }

    batch.update(postRef, {
        'stats.likesCount': isLiked ? increment(-1) : increment(1),
        'likedBy': isLiked ? arrayRemove(auth.currentUser.uid) : arrayUnion(auth.currentUser.uid)
    });

    await batch.commit();
    
    if (!isLiked && postData.authorId !== auth.currentUser.uid) {
        const notifRef = collection(db, `users/${postData.authorId}/notifications`);
        await addDoc(notifRef, {
            title: "Postingan Anda disukai",
            body: `${currentUserData.name} menyukai postingan Anda.`,
            isRead: false,
            createdAt: serverTimestamp(),
            link: { 
                screen: "community",
                params: { postId: postId }
            },
            type: 'like'
        });
    }
}

// --- [DIUBAH] Fungsi ini sekarang menangani komentar dan balasan ---
export async function submitComment(postId, text, currentUserData, parentCommentId = null) {
    const postRef = doc(db, 'posts', postId);
    const postSnap = await getDoc(postRef);
    if (!postSnap.exists()) throw new Error("Post not found");

    const postData = postSnap.data();
    const batch = writeBatch(db);
    
    const newCommentRef = doc(collection(db, `posts/${postId}/comments`));
    const commentData = {
        text: text,
        authorId: auth.currentUser.uid,
        authorName: currentUserData.name,
        authorAvatar: currentUserData.avatarUrl,
        createdAt: serverTimestamp(),
        replyCount: 0
    };

    if (parentCommentId) {
        commentData.parentId = parentCommentId;
        const parentCommentRef = doc(db, `posts/${postId}/comments`, parentCommentId);
        batch.update(parentCommentRef, { 'replyCount': increment(1) });
    }
    
    batch.set(newCommentRef, commentData);
    batch.update(postRef, { 'stats.commentsCount': increment(1) });

    await batch.commit();

    // Kirim notifikasi ke pemilik postingan (jika bukan komentar sendiri)
    if (postData.authorId !== auth.currentUser.uid) {
        const notifRef = collection(db, `users/${postData.authorId}/notifications`);
        await addDoc(notifRef, {
            title: parentCommentId ? "Ada balasan di postingan Anda" : "Postingan Anda dikomentari",
            body: `${currentUserData.name}: "${text.substring(0, 30)}..."`,
            isRead: false,
            createdAt: serverTimestamp(),
            link: { screen: "community", params: { postId: postId } },
            type: 'new_comment'
        });
    }

    // [BARU] Kirim notifikasi untuk mention
    await sendMentionNotifications(text, currentUserData.name, { screen: "community", params: { postId: postId } });
}

// --- [BARU] Fungsi untuk mengedit komentar ---
export async function editComment(postId, commentId, newText) {
    const commentRef = doc(db, `posts/${postId}/comments`, commentId);
    await updateDoc(commentRef, {
        text: newText,
        editedAt: serverTimestamp()
    });
}

// --- [BARU] Fungsi untuk menangani notifikasi @mention ---
async function sendMentionNotifications(text, authorName, link) {
    const mentionRegex = /@(\w+)/g;
    const mentions = text.match(mentionRegex);

    if (!mentions || mentions.length === 0) return;

    // Ambil daftar nama unik dari mention (tanpa '@')
    const mentionedUsernames = [...new Set(mentions.map(m => m.substring(1)))];

    for (const name of mentionedUsernames) {
        // Cari pengguna berdasarkan nama (case-insensitive)
        const userQuery = query(
            collection(db, "users"),
            where("name_lowercase", "==", name.toLowerCase()),
            limit(1)
        );
        const userSnapshot = await getDocs(userQuery);

        if (!userSnapshot.empty) {
            const mentionedUser = userSnapshot.docs[0];
            const mentionedUserId = mentionedUser.id;

            // Jangan kirim notifikasi ke diri sendiri
            if (mentionedUserId === auth.currentUser.uid) continue;

            const notifRef = collection(db, `users/${mentionedUserId}/notifications`);
            await addDoc(notifRef, {
                title: "Anda disebut dalam sebuah komentar",
                body: `${authorName} menyebut Anda: "${text.substring(0, 30)}..."`,
                isRead: false,
                createdAt: serverTimestamp(),
                link: link,
                type: 'mention'
            });
        }
    }
}


export async function markLessonAsComplete(userId, courseId, lessonId) {
    const userRef = doc(db, "users", userId);
    const progressRef = doc(db, `users/${userId}/completedLessons`, courseId);
    
    const progressSnap = await getDoc(progressRef);
    if (progressSnap.exists() && progressSnap.data().lessons.includes(lessonId)) {
        return;
    }

    const batch = writeBatch(db);
    batch.set(progressRef, { lessons: arrayUnion(lessonId) }, { merge: true });
    batch.update(userRef, { 'stats.completedLessons': increment(1) });
    
    await batch.commit();
}

export async function markCourseAsPassed(userId, courseId) {
    const userRef = doc(db, "users", userId);
    
    await updateDoc(userRef, { passedCourses: arrayUnion(courseId) });

    const userSnap = await getDoc(userRef);
    const totalCompleted = userSnap.data().stats.completedLessons || 0;
    
    const totalLessonsInApp = await getTotalLessonsInApp();
    
    let newSkillPercentage = 0;
    if (totalLessonsInApp > 0) {
        newSkillPercentage = Math.round((totalCompleted / totalLessonsInApp) * 100);
        await updateDoc(userRef, { 'stats.skill': newSkillPercentage });
    }

    return newSkillPercentage;
}

async function getTotalLessonsInApp() {
    try {
        let totalLessons = 0;
        const coursesQuery = query(collection(db, "courses"));
        const coursesSnapshot = await getDocs(coursesQuery);

        coursesSnapshot.forEach(courseDoc => {
            totalLessons += courseDoc.data().lessonsCount || 0;
        });
        
        return totalLessons;
    } catch (error) {
        console.error("Gagal menghitung total pelajaran di aplikasi:", error);
        return 0;
    }
}

export async function adminSaveHomepageLayout(layoutData) {
    const layoutRef = doc(db, "homepageLayout", "main");
    await setDoc(layoutRef, { sections: layoutData });
}

export async function deleteUserNotification(userId, notifId) {
    const notifRef = doc(db, `users/${userId}/notifications`, notifId);
    await deleteDoc(notifRef);
}

export async function adminDeleteNotificationHistory(historyId) {
    const historyRef = doc(db, "adminNotificationHistory", historyId);
    await deleteDoc(historyRef);
}
