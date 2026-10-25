global.chrome = {
  storage: {
    sync: {
      get: (keys, cb) => {
        const mockValues = {
          apiKey: "mock-api-key",
          numClarifyingQuestions: 5,
          numRefinedPrompts: 1
        };
        const result = {};
        keys.forEach(key => { result[key] = mockValues[key]; });
        cb(result);
      }
    }
  },
  runtime: {
    lastError: null
  }
};
