// File: src/js/pages/register.js
// Versi Refactor: 2.0
// Perubahan:
// - Menggunakan helper setButtonLoading untuk feedback visual saat registrasi.
// - Alur setelah registrasi sukses akan ditangani otomatis oleh auth.js.

import { handleRegistration } from '../auth.js';
import { loadScreen } from '../router.js';
import { setupPasswordToggle, setButtonLoading } from '../ui.js';

export function initPage(params, addL) {
    const registerButton = document.getElementById('register-button');
    const nameInput = document.getElementById('register-name');
    const emailInput = document.getElementById('register-email');
    const passwordInput = document.getElementById('register-password');
    const backToLoginBtn = document.getElementById('back-to-login-btn');

    const handleRegisterClick = () => {
        const name = nameInput.value;
        const email = emailInput.value;
        const password = passwordInput.value;
        handleRegistration(name, email, password, registerButton);
    };

    const handleEnterKey = (e) => {
        if (e.key === 'Enter') {
            handleRegisterClick();
        }
    }

    registerButton?.addEventListener('click', handleRegisterClick);
    nameInput?.addEventListener('keypress', handleEnterKey);
    emailInput?.addEventListener('keypress', handleEnterKey);
    passwordInput?.addEventListener('keypress', handleEnterKey);
    
    addL(() => {
        registerButton?.removeEventListener('click', handleRegisterClick);
        nameInput?.removeEventListener('keypress', handleEnterKey);
        emailInput?.removeEventListener('keypress', handleEnterKey);
        passwordInput?.removeEventListener('keypress', handleEnterKey);
    });

    if (backToLoginBtn) {
        const handleBackToLogin = (e) => {
            e.preventDefault();
            loadScreen('login');
        };
        backToLoginBtn.addEventListener('click', handleBackToLogin);
        addL(() => backToLoginBtn.removeEventListener('click', handleBackToLogin));
    }

    setupPasswordToggle('register-password', 'toggle-register-password-visibility');
}