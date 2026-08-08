export function validateStudentNewPassword(password) {
  const value = String(password ?? '');
  if (value.length < 6) {
    return { valid: false, message: '새 비밀번호는 6자 이상이어야 합니다.' };
  }
  if (value === '000000') {
    return { valid: false, message: '초기 비밀번호와 다른 비밀번호를 입력해 주세요.' };
  }
  return { valid: true, message: '' };
}

if (typeof window !== 'undefined') {
  window.PasswordPolicy = { validateStudentNewPassword };
}
