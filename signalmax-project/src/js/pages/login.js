// File: src/js/pages/login.js
// Versi Refactor: 2.0
// Perubahan:
// - Menggunakan helper setButtonLoading untuk feedback visual saat login.

import { handleEmailLogin, handleGoogleLogin } from '../auth.js';
import { loadScreen } from '../router.js';
import { setupPasswordToggle, openModal, setButtonLoading } from '../ui.js';

export function initPage(params, addL) {
    const loginButton = document.getElementById('login-button');
    const emailInput = document.getElementById('email');
    const passwordInput = document.getElementById('password');

    const handleLoginClick = () => {
        const email = emailInput.value;
        const password = passwordInput.value;
        // Melewatkan elemen tombol ke fungsi handleEmailLogin
        handleEmailLogin(email, password, loginButton);
    };

    const handleEnterKey = (e) => {
        if (e.key === 'Enter') {
            handleLoginClick();
        }
    }

    loginButton?.addEventListener('click', handleLoginClick);
    emailInput?.addEventListener('keypress', handleEnterKey);
    passwordInput?.addEventListener('keypress', handleEnterKey);
    
    addL(() => {
        loginButton?.removeEventListener('click', handleLoginClick);
        emailInput?.removeEventListener('keypress', handleEnterKey);
        passwordInput?.removeEventListener('keypress', handleEnterKey);
    });

    const googleLoginBtn = document.querySelector('#google-login-btn');
    if (googleLoginBtn) {
        const handleGoogleClick = () => handleGoogleLogin();
        googleLoginBtn.addEventListener('click', handleGoogleClick);
        addL(() => googleLoginBtn.removeEventListener('click', handleGoogleClick));
    }

    const goToRegisterBtn = document.getElementById('go-to-register-btn');
    if (goToRegisterBtn) {
        const handleGoToRegister = (e) => {
            e.preventDefault();
            loadScreen('register');
        };
        goToRegisterBtn.addEventListener('click', handleGoToRegister);
        addL(() => goToRegisterBtn.removeEventListener('click', handleGoToRegister));
    }

    const forgotPasswordBtn = document.getElementById('forgot-password-btn');
    if (forgotPasswordBtn) {
        const handleForgotPassword = (e) => {
            e.preventDefault();
            openModal('forgot-password-modal');
        };
        forgotPasswordBtn.addEventListener('click', handleForgotPassword);
        addL(() => forgotPasswordBtn.removeEventListener('click', handleForgotPassword));
    }

    setupPasswordToggle('password', 'toggle-password-visibility');
}