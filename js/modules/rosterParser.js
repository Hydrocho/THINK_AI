export function parse(text, existingNumbers = new Set()) {
  const seen = new Set();
  return String(text).split(/\r?\n/).filter(line => line.trim()).map(line => {
    const rawTrimmed = line.trim();
    // Split by comma or any whitespace (single space, multiple spaces, tabs)
    const fields = rawTrimmed.split(/[\t,]+|\s+/).map(v => v.trim()).filter(Boolean);

    const [grade, classNumber, number, ...nameParts] = fields;
    const name = nameParts.join(' ').trim();

    const isValidGrade = /^\d$/.test(grade || '');
    const isValidClass = /^\d{1,2}$/.test(classNumber || '');
    const isValidNumber = /^\d{1,2}$/.test(number || '');

    const studentNumber = (isValidGrade && isValidClass && isValidNumber)
      ? `${grade}${String(classNumber).padStart(2, '0')}${String(number).padStart(2, '0')}`
      : '';

    let reason = '';
    if (!studentNumber) reason = '학년·반·번호 형식이 올바르지 않습니다. (예: 3 2 10 이철수)';
    else if (!name) reason = '이름이 없습니다.';
    else if (seen.has(studentNumber)) reason = '붙여넣기 안에서 학번이 중복되었습니다.';
    else if (existingNumbers.has(studentNumber)) reason = '이미 등록된 학번입니다.';

    if (studentNumber) seen.add(studentNumber);

    return {
      studentNumber,
      name,
      valid: !reason,
      reason,
      grade: Number(grade),
      classNumber: Number(classNumber),
      number: String(number).padStart(2, '0')
    };
  });
}

if (typeof window !== 'undefined') window.RosterParser = { parse };
