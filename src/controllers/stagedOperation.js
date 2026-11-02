import Store from "../store";

export function stagedOperation(count, visit, commit, valid, title) {
  if (count <= 10000) {
    for (let i = 0; i < count; i++) if (visit(i) === false) return false;
    return valid() ? commit() : false;
  }
  return (async () => {
    let cancelled = false;
    const progress = $(
      "<div class='luckysheet-operation-progress'><span></span> <button type='button'>取消</button></div>"
    ).appendTo("#" + Store.container);
    progress.find("button").on("click", () => {
      cancelled = true;
    });
    try {
      let start = performance.now();
      for (let i = 0; i < count; i++) {
        if (visit(i) === false) return false;
        if (i % 128 === 0 && performance.now() - start > 8) {
          progress
            .find("span")
            .text(title + " " + Math.round((i / count) * 100) + "%");
          await new Promise(resolve => setTimeout(resolve, 0));
          if (cancelled || !valid()) return false;
          start = performance.now();
        }
      }
      return !cancelled && valid() ? commit() : false;
    } finally {
      progress.remove();
    }
  })();
}
