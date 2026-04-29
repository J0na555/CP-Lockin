(() => {
  if (typeof globalThis.browser !== "undefined") {
    return;
  }

  if (typeof globalThis.chrome === "undefined") {
    return;
  }

  const chrome = globalThis.chrome;


  const wrapAsync = (fn, context) =>
    (...args) =>
      new Promise((resolve, reject) => {
        fn.call(context, ...args, (result) => {
          const error = chrome.runtime?.lastError;
          if (error) {
            reject(error);
            return;
          }
          resolve(result);
        });
      });

  globalThis.browser = chrome;

  if (chrome.runtime?.sendMessage) {
    globalThis.browser.runtime.sendMessage = wrapAsync(chrome.runtime.sendMessage, chrome.runtime);
  }

  if (chrome.runtime?.openOptionsPage) {
    globalThis.browser.runtime.openOptionsPage = wrapAsync(
      chrome.runtime.openOptionsPage,
      chrome.runtime
    );
  }

  if (chrome.storage?.local?.get) {
    globalThis.browser.storage.local.get = wrapAsync(chrome.storage.local.get, chrome.storage.local);
  }
  if (chrome.storage?.local?.set) {
    globalThis.browser.storage.local.set = wrapAsync(chrome.storage.local.set, chrome.storage.local);
  }
  if (chrome.storage?.local?.remove) {
    globalThis.browser.storage.local.remove = wrapAsync(
      chrome.storage.local.remove,
      chrome.storage.local
    );
  }
  if (chrome.storage?.local?.clear) {
    globalThis.browser.storage.local.clear = wrapAsync(
      chrome.storage.local.clear,
      chrome.storage.local
    );
  }

  if (chrome.tabs?.create) {
    globalThis.browser.tabs.create = wrapAsync(chrome.tabs.create, chrome.tabs);
  }
})();
