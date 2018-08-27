const quitWithError = function (message, callback) {
  return callback(new Error(message), null);
};

export {
  quitWithError
};
