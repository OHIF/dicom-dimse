const quitWithError = (message, callback) => callback(new Error(message), null);

export {
  quitWithError
};
