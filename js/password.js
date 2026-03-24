// 密码保护功能 - 已禁用，无需密码即可访问

function isPasswordProtected() { return false; }
function isPasswordRequired() { return false; }
function isPasswordVerified() { return true; }
function ensurePasswordProtection() { return true; }
async function verifyPassword(password) { return true; }
function showPasswordModal() {}
function hidePasswordModal() {}
function showPasswordError() {}
function hidePasswordError() {}
async function handlePasswordSubmit() {}
function initPasswordProtection() {}

window.isPasswordProtected = isPasswordProtected;
window.isPasswordRequired = isPasswordRequired;
window.isPasswordVerified = isPasswordVerified;
window.ensurePasswordProtection = ensurePasswordProtection;
window.verifyPassword = verifyPassword;
window.showPasswordModal = showPasswordModal;
window.hidePasswordModal = hidePasswordModal;
window.handlePasswordSubmit = handlePasswordSubmit;
window.initPasswordProtection = initPasswordProtection;

// 页面加载完成后直接触发验证成功事件
document.addEventListener('DOMContentLoaded', function () {
    document.dispatchEvent(new CustomEvent('passwordVerified'));
});
