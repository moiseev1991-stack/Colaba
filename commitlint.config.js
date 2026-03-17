module.exports = {
  extends: ['@commitlint/config-conventional'],
  rules: {
    'type-enum': [
      2,
      'always',
      [
        'feat',     // Новая функция
        'fix',      // Исправление бага
        'docs',     // Документация
        'style',    // Форматирование, точки с запятой и т.д.
        'refactor', // Рефакторинг
        'perf',     // Производительность
        'test',     // Тесты
        'chore',    // Обслуживание (build, ci и т.д.)
        'revert',   // Откат коммита
        'build',    // Изменения сборки
        'ci',       // CI/CD изменения
      ],
    ],
    'subject-case': [0], // Отключаем проверку регистра
  },
};
