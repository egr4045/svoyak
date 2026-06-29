module.exports = {
  reporters: [
    "default",
    ["jest-html-reporter", {
      "pageTitle": "Svoyak - Результаты тестирования",
      "outputPath": "./test-report.html",
      "includeFailureMsg": true,
      "includeConsoleLog": true
    }]
  ]
};
